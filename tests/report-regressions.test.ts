import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_BYTES, MAX_LINES, MAX_LINE_LENGTH, parseMarkdown, safeLink, sourceProblem } from "../plugin/filePreview/markdown";
import { attachmentPreviewRange, HTML_CSP, MAX_HTML_DEPTH, parseHtml } from "../plugin/filePreview/html";

const markdownReport = Array.from({ length: 542 }, (_, i) => `Audit row ${i}: ` + "details ".repeat(12)).join("\n") + "\n## Final report section\n";
const htmlReport = "<h1>Report summary</h1>\n" + "<!-- report detail -->\n".repeat(2023) + "<h2>Final report section</h2>\n";

test("complete reports over 50 KB and 2,000 lines render", () => {
    const md = markdownReport + "\n" + "long report paragraph ".repeat(450);
    assert.ok(Buffer.byteLength(md) > 68852);
    assert.ok(parseMarkdown(md).nodes);
    assert.ok(htmlReport.split("\n").length >= 2026);
    assert.ok(parseHtml(htmlReport).document?.includes("Final report section"));
});

test("report size fixtures match the two observed attachment sizes", () => {
    const md = "# Report\n" + ("report body line " + "x".repeat(108) + "\n").repeat(540);
    const mdExact = md + "x".repeat(68852 - Buffer.byteLength(md));
    assert.equal(Buffer.byteLength(mdExact), 68852);
    // A large document with few DOM nodes and the exact 2,026-line shape.
    const prefix = "<h1>Report</h1>\n" + "<!-- filler -->\n".repeat(2023);
    const suffix = "<h2>Report end</h2>";
    const htmlExact = prefix + "<!--" + "x".repeat(84908 - Buffer.byteLength(prefix + suffix) - 8) + "-->\n" + suffix;
    assert.equal(Buffer.byteLength(htmlExact), 84908);
    assert.equal(htmlExact.split("\n").length, 2026);
    assert.ok(parseHtml(htmlExact).document?.includes("Report end"));
    assert.ok(sourceProblem(mdExact, 0) === undefined);
    assert.ok(parseMarkdown(mdExact).nodes);
});

test("fetch complete Markdown and HTML only from Discord attachment hosts", () => {
    for (const host of ["cdn.discordapp.com", "media.discordapp.net"])
        for (const name of ["a.md", "A.MARKDOWN", "a.html", "A.HTM"])
            assert.equal(attachmentPreviewRange(`https://${host}/attachments/1/2/${name}?signature=sample`), `bytes=0-${MAX_BYTES}`);
    for (const url of ["https://cdn.discordapp.com/attachments/1/2/a.txt", "https://cdn.discordapp.com/attachments/1/2/a.md.exe", "https://evil.invalid/attachments/1/2/a.md", "https://cdn.discordapp.com.evil.invalid/attachments/1/2/a.html", "https://cdn.discordapp.com/other/a.md", "http://cdn.discordapp.com/attachments/1/2/a.md", "invalid"])
        assert.equal(attachmentPreviewRange(url), "bytes=0-50000");
});

test("partial, unknown-length, negative-length and oversize content fails closed", () => {
    for (const value of [1, NaN, Infinity, -1, undefined]) {
        assert.ok(sourceProblem("report", value));
        if (value !== undefined) assert.ok(parseHtml("<p>Report</p>", value).error);
    }
    assert.ok(sourceProblem("x".repeat(MAX_BYTES + 1), 0));
    assert.ok(sourceProblem("😀".repeat(MAX_BYTES / 3), 0));
    assert.ok(parseHtml("x".repeat(MAX_BYTES + 1)).error);
});

test("formatted HTML, minified HTML and normal long Markdown lines stay bounded", () => {
    assert.ok(parseHtml("<p>" + "x".repeat(80000) + "</p>").document);
    assert.ok(parseMarkdown("a".repeat(8000)).nodes);
    assert.ok(parseMarkdown("a".repeat(MAX_LINE_LENGTH + 1)).error);
    assert.ok(parseHtml("\n".repeat(MAX_LINES + 1)).error);
    assert.ok(parseMarkdown("\n".repeat(MAX_LINES + 1)).error);
});

test("Markdown semantics and raw source remain intact", () => {
    const source = "# Heading\n\n**bold** and `code`\n\n| A | B |\n| - | - |\n| x | y |\n\n```js\nconst x = 1;\n```\n";
    const result = parseMarkdown(source);
    assert.ok(result.nodes);
    const json = JSON.stringify(result.nodes);
    for (const tag of ["h1", "strong", "code", "table", "pre"]) assert.ok(json.includes(`\"tag\":\"${tag}\"`));
    assert.equal(source.includes("**bold**"), true);
});

for (const href of ["javascript:alert(1)", "data:text/html,evil", "file:///tmp/a", "discord://settings", "//evil.invalid", "/relative", "https://user:pass@evil.invalid", "https://evil.invalid/\n", "hTtPs:\\evil.invalid", "mailto:a@b.invalid"]) {
    test(`unsafe Markdown link ${JSON.stringify(href)} remains inactive`, () => assert.equal(safeLink(href), undefined));
}

test("Markdown HTML remains inert and image resources are removed", () => {
    const json = JSON.stringify(parseMarkdown('<script>parent.leak=true</script>\n\n![image](https://tracking.invalid/a)\n\n[x](javascript:alert%281%29)').nodes);
    assert.ok(json.includes("not loaded"));
    assert.ok(!json.includes('"tag":"script"'));
    assert.ok(!json.includes('"href"'));
    assert.ok(!json.includes("tracking.invalid"));
});

test("HTML sanitization and restrictive CSP survive the larger report budget", () => {
    const attacks = '<script>parent.leak=true;fetch("https://tracking.invalid")</script><style>@import "https://tracking.invalid"</style><p onclick="alert(1)" style="background:url(https://tracking.invalid)">Report</p><a href="https://tracking.invalid" target="_top">Label</a><img src="https://tracking.invalid" alt="Placeholder"><form action="https://tracking.invalid"><input></form><iframe src="https://tracking.invalid"></iframe><svg><a href="javascript:alert(1)">x</a></svg>';
    const result = parseHtml(attacks);
    assert.ok(result.document);
    const body = result.document.split("<body>")[1];
    assert.ok(body.includes("Report"));
    assert.ok(body.includes("Placeholder"));
    assert.ok(!/https:|javascript:|onclick|<script|<style|<img|<form|<iframe|<svg|href=|style=/.test(body));
    for (const directive of ["default-src 'none'", "script-src 'none'", "connect-src 'none'", "img-src 'none'", "form-action 'none'"]) assert.ok(HTML_CSP.includes(directive));
});

test("deep and dense content exceeds finite parser budgets", () => {
    assert.ok(parseHtml("<div>".repeat(MAX_HTML_DEPTH + 2) + "x" + "</div>".repeat(MAX_HTML_DEPTH + 2)).error);
    assert.ok(parseHtml("<span>x</span>".repeat(7000)).error);
    assert.ok(parseMarkdown("> ".repeat(30) + "deep").error);
});

test("larger bounded adversarial inputs parse promptly", () => {
    const start = performance.now();
    for (const source of ["[".repeat(16000), "*".repeat(16000), "<".repeat(250000), "<p>text</p>".repeat(12000)]) {
        parseMarkdown(source);
        parseHtml(source);
    }
    assert.ok(performance.now() - start < 2000);
});


test("Markdown horizontal rules and hard line breaks produce supported void nodes", () => {
    const result = parseMarkdown("# Synthetic report\n\nBefore.\n\n---\n\nFirst line  \nSecond line.\n\nAfter.\n");
    assert.ok(result.nodes);
    const voids: string[] = [];
    const walk = (nodes: NonNullable<typeof result.nodes>) => nodes.forEach(node => {
        if (typeof node === "string") return;
        if (node.tag === "hr" || node.tag === "br") {
            voids.push(node.tag);
            assert.deepEqual(node.children, []);
        }
        walk(node.children);
    });
    walk(result.nodes);
    assert.deepEqual(voids, ["hr", "br"]);
});
