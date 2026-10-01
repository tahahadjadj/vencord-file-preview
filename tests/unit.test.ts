import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { isMarkdownFilename, MAX_BYTES, parseMarkdown, safeLink, sourceProblem } from "../plugin/filePreview/markdown";
import { previewPatch } from "../plugin/filePreview/patches";

test("only exact Markdown filenames qualify", () => {
    for (const name of ["a.md", "A.MD", "SPOILER_a.markdown", "README.MarkDown"]) assert.ok(isMarkdownFilename(name));
    for (const name of ["a.txt", "a.md.exe", "a.md?query", "markdown", undefined, {}, "md"]) assert.ok(!isMarkdownFilename(name));
});

for (const href of ["javascript:alert(1)", "data:text/html,evil", "file:///etc/passwd", "discord://settings", "vbscript:x", "//evil.test", "/relative", "https://user:pass@evil.test", "https://example.test/\n", "hTtPs:\\evil.test", "mailto:test@example.test", "https://[invalid"]) {
    test(`reject unsafe link ${JSON.stringify(href)}`, () => assert.equal(safeLink(href), undefined));
}

test("safe links preserve explicit web protocols", () => {
    assert.equal(safeLink("https://example.test/docs?a=b#c"), "https://example.test/docs?a=b#c");
    assert.equal(safeLink("HTTP://example.test"), "http://example.test/");
});

test("GFM headings, lists, links, fenced code and tables", () => {
    const result = parseMarkdown("# Title\n\n- one\n- **two**\n\n3. third\n\n[link](https://example.test)\n\n```js\nconst x = '<script>';\n```\n\n| A | B |\n| :- | -: |\n| x | y |\n");
    assert.ok(result.nodes);
    const tags: string[] = [];
    const walk = (nodes: any[]) => nodes.forEach(node => { if (typeof node !== "string") { tags.push(node.tag); walk(node.children); } });
    walk(result.nodes);
    for (const tag of ["h1", "ul", "ol", "strong", "a", "pre", "code", "table", "thead", "tbody", "th", "td"]) assert.ok(tags.includes(tag), tag);
    assert.equal((result.nodes.find((node: any) => node.tag === "ol") as any).start, 3);
});

test("HTML, scripts and embeds stay inert text; images have no URL", () => {
    const result = parseMarkdown('<script>window.localStorage.token</script>\n\n<iframe src="https://evil.test"></iframe>\n\n![tracker](https://evil.test/pixel)\n\n[bad](javascript:alert%281%29)\n');
    assert.ok(result.nodes);
    const output = JSON.stringify(result.nodes);
    assert.ok(output.includes("<script>"));
    assert.ok(output.includes("not loaded"));
    assert.ok(!output.includes("pixel"));
    assert.ok(!output.includes('"href"'));
    assert.ok(!output.includes('"tag":"script"'));
    assert.ok(!output.includes('"tag":"iframe"'));
});

test("raw content remains exact and entities are rendered as text", () => {
    const source = "**bold** &lt;script&gt; &amp; &#x1F600;\n";
    const result = parseMarkdown(source);
    assert.ok(result.nodes);
    assert.ok(JSON.stringify(result.nodes).includes("<script> & 😀"));
    assert.equal(source, "**bold** &lt;script&gt; &amp; &#x1F600;\n");
});

test("truncated, unknown and oversize content fails closed", () => {
    for (const bytes of [1, NaN, Infinity, -1, undefined]) assert.ok(sourceProblem("hello", bytes));
    assert.ok(sourceProblem(undefined, 0));
    assert.ok(parseMarkdown("a".repeat(MAX_BYTES + 1)).error);
    assert.ok(parseMarkdown("😀".repeat(MAX_BYTES / 3)).error);
    assert.ok(parseMarkdown("x\n".repeat(2001)).error);
    assert.ok(parseMarkdown("x".repeat(4097)).error);
});

test("deep and dense documents fail closed", () => {
    assert.ok(parseMarkdown("> ".repeat(30) + "deep").error);
    assert.ok(parseMarkdown(("|" + " a |".repeat(50) + "\n") + ("|" + "---|".repeat(50) + "\n") + ("|" + " b |".repeat(50) + "\n").repeat(80)).error);
});

test("bounded adversarial input parses within a reasonable time", () => {
    const samples = ["[".repeat(4000), "*".repeat(4000), "> ".repeat(1500) + "x", ("[x](https://example.test) ".repeat(100) + "\n").repeat(20)];
    const start = performance.now();
    for (const source of samples) parseMarkdown(source);
    assert.ok(performance.now() - start < 1500);
});

test("all patches match current public inline/modal functions exactly once and preserve syntax", () => {
    let source = readFileSync(new URL("./fixtures/text-preview.js", import.meta.url), "utf8");
    const replacements = Array.isArray(previewPatch.replacement) ? previewPatch.replacement : [previewPatch.replacement];
    for (const replacement of replacements) {
        const pattern = replacement.match as RegExp;
        const canonical = new RegExp(pattern.source.replaceAll("\\i", "(?:[A-Za-z_$][\\w$]*)"), "g");
        assert.equal([...source.matchAll(canonical)].length, 1);
        source = source.replace(canonical, (replacement.replace as string).replaceAll("$self", "plugin"));
    }
    assert.equal((source.match(/plugin.wrapPreview/g) ?? []).length, 2);
    assert.doesNotThrow(() => new Function("plugin", source));
    const captured: any[] = [];
    const jsx = (type: any, props: any) => ({ type, props });
    const styleNames = new Proxy({}, { get: (_, property) => String(property) });
    const react = { useState: (value: any) => [value, () => {}], useRef: () => ({ current: null }), useEffect: () => {} };
    const intl = { string: () => "label", formatToPlainString: () => "notice" };
    const keyNames = new Proxy({}, { get: (_, property) => String(property) });
    const plugin = { isFilePreview: () => true, wrapPreview: (props: any, native: any, raw: any) => { captured.push({ props, native, raw }); return { wrapped: true }; } };
    const factory = new Function("r", "a", "l", "eA", "S", "I", "eE", "ed", "eI", "ef", "ep", "eT", "em", "eS", "eg", "ei", "_", "c", "eh", "plugin", source + ";return { inline:eN, modal:eC };");
    const component = factory({ jsx, jsxs: jsx }, react, () => (...values: any[]) => values, styleNames, { Ip: "scroller" }, { y: "loading" }, { intl, t: keyNames }, { up: () => "size" }, "nativeMarkdown", "nativeRaw", "expand", "filename", "language", "openModal", "menu", { d: "modal" }, { E: "text" }, {}, new Set(["md"]), plugin);
    const props = { url: "https://cdn.discordapp.com/attachments/demo/notes.md", fileName: "notes.md", fileContents: "# Exact source", bytesLeft: 0, language: "md", markdownEnabled: true, renderMarkdown: true, expanded: false, wordWrap: true };
    component.inline(props);
    component.modal(props);
    assert.equal(captured.length, 2);
    for (const value of captured) {
        assert.equal(value.props, props);
        assert.equal(value.raw.type, "nativeRaw");
        assert.equal(value.raw.props.text, props.fileContents);
        assert.equal(value.native.type, "nativeMarkdown");
    }
    assert.ok(source.includes("fileName:n"));
    assert.ok(source.includes("url:t"));
    assert.ok(source.includes("wordWrap"));
    // Grouped patches are discarded together by Vencord if either signature changes.
    assert.equal(previewPatch.group, true);
    const broken = source.replaceAll("children:", "changedChildren:");
    assert.ok(replacements.every(replacement => !new RegExp((replacement.match as RegExp).source.replaceAll("\\i", "(?:[A-Za-z_$][\\w$]*)")).test(broken)));
});

test("CopyFileContents injection points remain available after preview patches", () => {
    let source = readFileSync(new URL("./fixtures/text-preview.js", import.meta.url), "utf8");
    for (const replacement of previewPatch.replacement as any[]) source = source.replace(new RegExp(replacement.match.source.replaceAll("\\i", "(?:[A-Za-z_$][\\w$]*)")), replacement.replace.replaceAll("$self", "plugin"));
    // CopyFileContents signatures captured from the verified Vencord base.
    const patterns = ["fileContents:(\\i),bytesLeft:(\\i)\\}\\):null,", "align:\"\\i\"\\}\\),(?=\\(0,\\i\\.jsx\\)\\(\\i,\\{wordWrap:\\i,setWordWrap:\\i)"];
    assert.equal(patterns.length, 2);
    for (const pattern of patterns) assert.ok(new RegExp(pattern.replaceAll("\\i", "(?:[A-Za-z_$][\\w$]*)")).test(source));
});

import { HTML_CSP, isHtmlFilename, parseHtml } from "../plugin/filePreview/html";

test("HTML filenames are exact and case insensitive", () => {
    for (const name of ["page.html", "PAGE.HTM", "SPOILER_page.HTML"]) assert.ok(isHtmlFilename(name));
    for (const name of ["page.html.exe", "page.xhtml", "page.html?x", undefined]) assert.ok(!isHtmlFilename(name));
});

test("HTML preserves allowlisted semantics and escapes text", () => {
    const result = parseHtml('<h1>Title</h1><ul><li><strong>One</strong></li></ul><table><tr><td>A</td></tr></table><pre><code>&lt;script&gt;</code></pre>');
    assert.ok(result.document);
    for (const token of ["<h1>Title</h1>", "<strong>One</strong>", "<table>", "&lt;script&gt;"]) assert.ok(result.document.includes(token));
});

test("HTML strips scripts, all source attributes, CSS and active content", () => {
    const attacks = ['<script>parent.leak=true;fetch("https://evil.invalid")</script>', '<p onclick="alert(1)" style="background:url(https://evil.invalid)" id="clobber">Keep</p>', '<style>@import "https://evil.invalid";</style><link rel="stylesheet" href="https://evil.invalid">', '<meta http-equiv="refresh" content="0;url=https://evil.invalid"><base href="https://evil.invalid">', '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe><object data="https://evil.invalid"></object>', '<form action="https://evil.invalid"><input autofocus></form>', '<svg><a xlink:href="javascript:alert(1)">bad</a></svg><math><mtext><img src=x onerror=alert(1)></mtext></math>', '<a href="https://evil.invalid" target="_top" ping="https://evil.invalid">Link label</a>', '<img src="https://evil.invalid/pixel" alt="&quot;&gt;&lt;script&gt;attack&lt;/script&gt;">'];
    for (const input of attacks) {
        const result = parseHtml(input);
        assert.ok(result.document);
        const body = result.document.split("<body>")[1];
        assert.ok(!/https:|javascript:|onerror|onclick|srcdoc|<script|<style|<meta|<base|<iframe|<object|<form|<svg|<math|href=|style=|id=/.test(body), input);
    }
});

test("malformed and mutation-style HTML cannot escape the allowlist", () => {
    for (const source of ['<svg><style><img src=x onerror=alert(1)>', '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=evil onerror=alert(1)>">', '<noscript><p title="</noscript><img src=evil onerror=alert(1)>">', '<template><iframe src=evil></template><p data-x="evil">OK</p>', '<!--><script>alert(1)</script>']) {
        const result = parseHtml(source);
        assert.ok(result.document);
        assert.ok(!/<(?:script|iframe|img|svg|math|form)\b|\son\w+=/.test(result.document));
    }
});

test("HTML has a restrictive CSP before any rendered source and no source-controlled theme", () => {
    const dark = parseHtml('<p style="color:red">Hello</p>').document!;
    assert.ok(dark.indexOf("Content-Security-Policy") < dark.indexOf("<body>"));
    for (const directive of ["default-src 'none'", "script-src 'none'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'"]) assert.ok(HTML_CSP.includes(directive));
    assert.ok(dark.includes("color-scheme:dark"));
    assert.ok(parseHtml("<p>Hello</p>", 0, true).document!.includes("color-scheme:light"));
    assert.ok(!dark.includes("color:red"));
});

test("HTML partial, size, line, depth and node limits fail closed", () => {
    assert.ok(parseHtml("<p>Partial</p>", 1).error);
    assert.ok(parseHtml("<p>Missing length</p>", NaN).error);
    assert.ok(parseHtml("x".repeat(MAX_BYTES + 1)).error);
    assert.ok(parseHtml("<div>".repeat(30) + "deep" + "</div>".repeat(30)).error);
    assert.ok(parseHtml(("<span>x</span>".repeat(200) + "\n").repeat(20)).error);
});

test("HTML parsing is inert and bounded on adversarial text", () => {
    const start = performance.now();
    for (const source of ["<".repeat(4000), "&".repeat(4000), ("<p title='x'>x</p>".repeat(150) + "\n").repeat(15)]) parseHtml(source);
    assert.ok(performance.now() - start < 1500);
});
