import assert from "node:assert/strict";
import { test } from "node:test";

import { attachmentPreviewRange } from "../plugin/filePreview/html";
import { MAX_BYTES } from "../plugin/filePreview/markdown";
import { isSvgFilename, MAX_SVG_BYTES, MAX_SVG_DEPTH, MAX_SVG_NODES, MAX_SVG_NUMBERS, MAX_SVG_OUTPUT_BYTES, MAX_SVG_PATH_COMMANDS, MAX_SVG_PATH_LENGTH, MAX_SVG_STYLE_RULES, parseSvg, SVG_CSP } from "../plugin/filePreview/svg";

const body = (source: string) => {
    const result = parseSvg(source);
    assert.ok(result.document, result.error);
    return result.document.split("<body>")[1];
};

test("exact SVG extensions receive the shared bounded Discord CDN range", () => {
    for (const name of ["shape.svg", "SHAPE.SVG", "SPOILER_shape.Svg"]) {
        assert.ok(isSvgFilename(name));
        for (const host of ["cdn.discordapp.com", "media.discordapp.net"])
            assert.equal(attachmentPreviewRange(`https://${host}/attachments/1/2/${name}?signature=sample`), `bytes=0-${MAX_BYTES}`);
    }
    for (const name of ["shape.svgz", "shape.svg.exe", "shape.svg?query", undefined]) assert.ok(!isSvgFilename(name));
    assert.equal(attachmentPreviewRange("https://evil.invalid/attachments/1/2/shape.svg"), "bytes=0-50000");
});

test("basic SVG geometry, text, viewBox and dimensions survive", () => {
    const output = body('<svg viewBox="-10,-20,320,180" width="640" height="360" preserveAspectRatio="xMidYMid meet"><title>A &amp; B</title><g transform="translate(2 3)"><path d="M0 0 L20 20 Z" fill="#abcd"/><rect x="10" y="20" width="40" height="30" rx="4"/><circle cx="100" cy="50" r="20"/><ellipse cx="150" cy="50" rx="20" ry="10"/><line x1="10" y1="100" x2="50" y2="100"/><polyline points="0,0 10,10"/><polygon points="0,0 10,0 5,5"/><text x="10" y="150" font-size="14"><tspan dx="2">Label &lt;literal&gt;</tspan></text></g></svg>');
    for (const value of ['viewBox="-10 -20 320 180"', 'width="640"', 'height="360"', 'transform="translate(2 3)"', 'fill="#abcd"', "<rect", "<circle", "<ellipse", "<line", "<polyline", "<polygon", "<text", "<tspan", "A &amp; B", "Label &lt;literal&gt;"]) assert.ok(output.includes(value), value);
});

test("simple class/id/tag CSS and inline presentation styles become validated attributes", () => {
    const output = body('<svg><style>/* comment */ rect{fill:blue} .shape{fill:#123456;stroke:rgb(1,2,3)} #box{fill:green}</style><rect id="box" class="shape" width="20" height="20" style="fill:red;opacity:0.5;stroke-width:2"/></svg>');
    assert.ok(output.includes('fill="red"'));
    assert.ok(output.includes('stroke="rgb(1,2,3)"'));
    assert.ok(output.includes('opacity="0.5"'));
    assert.ok(!/<style|\sstyle=|\sclass=|id="box"/.test(output));
});

test("local gradient and clip references are typed, renamed and nonrecursive", () => {
    const output = body('<svg><defs><linearGradient id="paint" x1="0%" x2="100%" gradientUnits="objectBoundingBox"><stop offset="0%" stop-color="red"/><stop offset="100%" stop-color="blue"/></linearGradient><clipPath id="clip" clip-path="url(#clip)"><rect width="10" height="10" clip-path="url(#clip)"/></clipPath></defs><rect width="20" height="20" fill="url(#paint)" clip-path="url(#clip)"/></svg>');
    assert.ok(output.includes('fill="url(#vc-svg-0)"'));
    assert.ok(output.includes('clip-path="url(#vc-svg-1)"'));
    assert.equal((output.match(/clip-path=/g) ?? []).length, 1);
    assert.ok(!/url\(#(?:paint|clip)\)/.test(output));
    assert.ok(!body('<svg><path id="notpaint" d="M0 0 L1 1"/><rect fill="url(#notpaint)"/></svg>').includes("url("));
});

test("active elements, animations, filters and all image/use resources are discarded", () => {
    const output = body('<svg onload="parent.svgExecuted=true"><script>parent.svgExecuted=true</script><foreignObject><div><img src="https://tracking.invalid/x" onerror="alert(1)"></div></foreignObject><image href="https://tracking.invalid/image"/><use href="#cycle" id="cycle"/><animate attributeName="href" values="javascript:alert(1)"/><animateTransform attributeName="transform"/><set attributeName="onload" to="alert(1)"/><filter id="f"><feImage href="https://tracking.invalid/filter"/></filter><rect width="10" height="10" filter="url(#f)" onclick="alert(1)"/></svg>');
    assert.ok(output.includes("<rect"));
    assert.ok(!/script|foreignObject|<image|<use|<animate|<set|<filter|feImage|onload|onclick|https:|javascript:/.test(output));
    assert.ok(!output.includes("filter=\""));
});

test("linked drawings keep geometry while all navigation and namespaced hrefs disappear", () => {
    const output = body('<svg xmlns:xlink="http://www.w3.org/1999/xlink"><a href="javascript:alert(1)" xlink:href="https://tracking.invalid" target="_top"><rect width="20" height="20"/></a></svg>');
    assert.ok(output.includes("<g>"));
    assert.ok(output.includes("<rect"));
    assert.ok(!/<a\b|href|xlink|target|tracking|javascript/.test(output));
});

test("external paint/CSS references, functions and imports cannot survive validation", () => {
    const output = body('<svg><style>@import "https://tracking.invalid/import";.shape{fill:url(https://tracking.invalid/fill);stroke:var(--evil);filter:url(#x);font-family:url(https://tracking.invalid/font);animation:run 1s}</style><rect class="shape" style="fill:url(data:image/svg+xml,evil);stroke:expression(alert(1));background-image:url(https://tracking.invalid/bg)" width="10" height="10"/><path fill="url(&#x68;ttps://tracking.invalid/encoded)" stroke="url(//tracking.invalid/a)" d="M0 0 L1 1"/></svg>');
    assert.ok(!/tracking|https:|data:|expression|var\(|url\(|animation|filter|style=/.test(output));
});

test("foreign/mutation markup and XML processing instructions cannot introduce HTML or requests", () => {
    for (const source of [
        '<?xml version="1.0"?><?xml-stylesheet href="https://tracking.invalid/a"?><!DOCTYPE svg [<!ENTITY x SYSTEM "https://tracking.invalid/entity">]><svg><text>&x;</text></svg>',
        '<svg><foreignObject><svg><script>parent.evil=true</script></svg><iframe src=evil></iframe></foreignObject><rect/></svg>',
        '<svg><desc><img src=x onerror=alert(1)></desc><rect/></svg>',
        '<svg><style><!--</style><image href="https://tracking.invalid"/><rect/></svg>'
    ]) {
        const result = parseSvg(source);
        if (result.document) assert.ok(!/<(?:script|img|iframe|foreignObject|image|use|filter)\b|\son\w+=|href=|tracking/.test(result.document));
    }
    for (const source of ["<html><p>No SVG</p></html>", "<svg></svg><svg></svg>"]) assert.ok(parseSvg(source).error);
});

test("SVG text is escaped rather than interpreted as markup", () => {
    const output = body('<svg><text>&lt;script&gt;literal&lt;/script&gt; &amp; "quotes"</text></svg>');
    assert.ok(output.includes("&lt;script&gt;literal&lt;/script&gt;"));
    assert.ok(!output.includes("<script"));
});

test("missing/partial/oversize text fails closed and long minified documents remain bounded", () => {
    for (const bytes of [1, NaN, Infinity, -1]) assert.ok(parseSvg("<svg/>", bytes).error);
    assert.ok(parseSvg("x".repeat(MAX_SVG_BYTES + 1)).error);
    assert.ok(parseSvg("😀".repeat(MAX_SVG_BYTES / 3)).error);
    assert.ok(parseSvg('<svg><!--' + "x".repeat(80000) + '--><rect width="10" height="10"/></svg>').document);
});

test("node/depth/tag preflight guards reject excessive SVG trees", () => {
    assert.ok(parseSvg("<svg>" + "<circle/>".repeat(MAX_SVG_NODES) + "</svg>").error);
    assert.ok(parseSvg("<svg>" + "<g>".repeat(MAX_SVG_DEPTH + 1) + "</g>".repeat(MAX_SVG_DEPTH + 1) + "</svg>").error);
    assert.ok(parseSvg("<svg><foreignObject>" + "<b>".repeat(MAX_SVG_NODES) + "</b>".repeat(MAX_SVG_NODES) + "</foreignObject></svg>").error);
});

test("path length, command, geometry-number and text budgets reject resource exhaustion", () => {
    assert.ok(parseSvg('<svg><path d="M0 0 ' + "L1 1 ".repeat(MAX_SVG_PATH_COMMANDS) + '"/></svg>').error);
    assert.ok(parseSvg('<svg><path d="M' + "0".repeat(MAX_SVG_PATH_LENGTH) + ' 0"/></svg>').error);
    assert.ok(parseSvg('<svg><polyline points="' + "0 ".repeat(MAX_SVG_NUMBERS + 1) + '"/></svg>').error);
    assert.ok(parseSvg("<svg><text>" + "a".repeat(8193) + "</text></svg>").error);
});

test("style-rule/output expansion budgets are independent of file size", () => {
    assert.ok(parseSvg("<svg><style>" + Array.from({ length: MAX_SVG_STYLE_RULES + 1 }, (_, index) => `.c${index}{fill:red}`).join("") + "</style></svg>").error);
    const css = `.a{font-family:${"a".repeat(128)};dominant-baseline:text-before-edge;shape-rendering:geometricPrecision;text-rendering:geometricPrecision;stroke-linejoin:miter-clip;font-weight:bold;font-size:512;visibility:visible;vector-effect:non-scaling-stroke;paint-order:stroke fill markers;stroke-linecap:square;fill:rebeccapurple;stroke:rebeccapurple}`;
    const source = "<svg><style>" + css + "</style>" + ('<text class="a">' + "&lt;".repeat(8000) + '</text>').repeat(3) + "</svg>";
    assert.ok(Buffer.byteLength(source) < MAX_BYTES);
    assert.ok(parseSvg(source).error);
    assert.equal(MAX_SVG_OUTPUT_BYTES, MAX_SVG_BYTES);
});

test("dimensions and numeric attributes cannot create unbounded or non-finite geometry", () => {
    const output = body('<svg width="1000000" height="1000000" viewBox="0 0 1e999 2" constructor="x"><circle r="1e999"/><text font-size="1000000em">Label</text></svg>');
    assert.ok(!/1000000|1e999|font-size=|viewBox=|width=|height=|constructor=/.test(output));
    assert.ok(!body('<svg viewBox="0 0 1e-100 1e-100"/>').includes("viewBox="));
});

test("SVG CSP precedes all attachment markup and keeps both theme modes isolated", () => {
    for (const light of [false, true]) {
        const document = parseSvg("<svg><rect/></svg>", 0, light).document!;
        assert.ok(document.indexOf("Content-Security-Policy") < document.indexOf("<svg"));
        assert.ok(document.includes(`color-scheme:${light ? "light" : "dark"}`));
    }
    assert.ok(SVG_CSP.includes("img-src data:"));
    for (const directive of ["default-src 'none'", "script-src 'none'", "connect-src 'none'", "font-src 'none'", "form-action 'none'", "base-uri 'none'"]) assert.ok(SVG_CSP.includes(directive));
});

test("bounded hostile XML, styles and malformed vectors finish promptly", () => {
    const start = performance.now();
    for (const source of ["<svg><style>" + "/*".repeat(16000) + "</style></svg>", "<svg>" + "<".repeat(250000) + "</svg>", '<svg><path d="' + "-".repeat(60000) + '"/></svg>']) parseSvg(source);
    assert.ok(performance.now() - start < 1500);
});
