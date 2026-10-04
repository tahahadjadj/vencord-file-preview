import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSvgSource, MAX_SVG_BYTES, parseSvg, parseSvgAsync, svgAttachmentUrl, svgLoadProblem } from "../plugin/filePreview/svg";

const url = "https://cdn.discordapp.com/attachments/1/2/large.svg?signature=synthetic";
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const drawing = '<svg width="320" height="160" viewBox="0 0 320 160"><rect width="320" height="160" fill="blue"/></svg>';
const padded = (bytes: number) => drawing.replace("<rect", "<!--" + "x".repeat(bytes - drawing.length - 7) + "--><rect");

test("7 MiB SVG is reduced before AST parsing and cooperative parsing can cancel", async () => {
    const source = padded(7 * 1024 * 1024);
    assert.equal(Buffer.byteLength(source), 7 * 1024 * 1024);
    let ticks = 0;
    const timer = setInterval(() => ticks++, 1);
    const result = await parseSvgAsync(source);
    clearInterval(timer);
    assert.ok(result?.document, result?.error);
    assert.ok(result.document.length < 2000);
    assert.ok(ticks > 0);
    let cancelled = false;
    const parsing = parseSvgAsync('<svg><image href="data:image/png;base64,' + "A".repeat(7 * 1024 * 1024) + '"/></svg>', 0, false, () => cancelled);
    setTimeout(() => { cancelled = true; }, 2);
    assert.equal(await parsing, undefined);
    assert.match(parseSvg(padded(MAX_SVG_BYTES + 1)).error!, /8 MiB/);
});

test("larger Illustrator-like geometry remains bounded with many styles and primitive clones", async () => {
    const style = '<style>' + Array.from({length:149}, (_, i) => `.c${i}{fill:blue}`).join('') + '</style>';
    const paths = Array.from({length:2353}, (_,i) => `<path class="c${i % 149}" d="M0 0 ${"L1 1 ".repeat(30)}Z"/>`).join('');
    const source = '<svg><defs><rect id="shape" width="20" height="20"/></defs><clipPath id="clip"><use href="#shape"/></clipPath>' + style + paths + '<g clip-path="url(#clip)"><rect width="30" height="30"/></g></svg>';
    let turns = 0;
    const timer = setInterval(() => turns++, 1);
    const result = await parseSvgAsync(source);
    clearInterval(timer);
    assert.ok(result?.document, result?.error);
    assert.ok(turns > 30);
    assert.equal((result.document.match(/<path /g) ?? []).length, 2353);
    assert.ok(!result.document.includes('<use'));
});

test("only exact HTTPS Discord SVG attachment URLs and known bounded sizes load", () => {
    assert.equal(svgAttachmentUrl(url), url);
    for (const value of ["https://cdn.discordapp.com.evil.invalid/attachments/1/2/a.svg", "https://user@cdn.discordapp.com/attachments/1/2/a.svg", "https://cdn.discordapp.com:444/attachments/1/2/a.svg", "https://cdn.discordapp.com/attachments/1/2/a.svgz", "http://cdn.discordapp.com/attachments/1/2/a.svg", "https://cdn.discordapp.com/images/a.svg"]) assert.equal(svgAttachmentUrl(value), undefined);
    for (const size of [undefined, 0, -1, Infinity, 0.5, MAX_SVG_BYTES + 1]) assert.ok(svgLoadProblem(url, size));
});

test("streaming full SVG load omits credentials, rejects redirects and verifies exact bytes", async () => {
    const source = padded(7 * 1024 * 1024);
    const request = (async (input: unknown, options: RequestInit) => {
        assert.equal(input, url);
        assert.equal(options.credentials, "omit");
        assert.equal(options.redirect, "error");
        assert.equal(options.referrerPolicy, "no-referrer");
        assert.equal((options.headers as Record<string, string>).Range, `bytes=0-${MAX_SVG_BYTES - 1}`);
        return new Response(source);
    }) as typeof fetch;
    assert.equal(await loadSvgSource(url, source.length, new AbortController().signal, request), source);
    for (const response of [new Response("short"), new Response(new Uint8Array([255]), {headers:{"Content-Length":"1"}}), new Response("failed", {status:403})]) {
        await assert.rejects(loadSvgSource(url, 6, new AbortController().signal, (async () => response) as typeof fetch));
    }
    await assert.rejects(loadSvgSource(url, 1, new AbortController().signal, (async () => new Response(new Uint8Array([255]))) as typeof fetch), /UTF-8/);
});

test("lying/missing HTTP length cannot bypass the cap and oversize streams are cancelled", async () => {
    for (const length of [undefined, "1"]) {
        let cancelled = false;
        const body = new ReadableStream<Uint8Array>({start(controller) { controller.enqueue(new Uint8Array(MAX_SVG_BYTES + 1)); }, cancel() { cancelled = true; }});
        const response = new Response(body, {headers: length ? {"Content-Length": length} : {}});
        await assert.rejects(loadSvgSource(url, MAX_SVG_BYTES, new AbortController().signal, (async () => response) as typeof fetch), /oversized/);
        assert.ok(cancelled);
    }
    let called = false;
    await assert.rejects(loadSvgSource(url, MAX_SVG_BYTES + 1, new AbortController().signal, (async () => {called = true; return new Response();}) as typeof fetch));
    assert.ok(!called);
});

test("bounded embedded raster, mask and color matrix survive without source CSS or clones", () => {
    const result = parseSvg(`<svg><defs><rect id="r" width="20" height="20"/><clipPath id="c"><use href="#r"/></clipPath><filter id="f" width="20" height="20" filterUnits="userSpaceOnUse"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter><mask id="m" width="20" height="20" maskUnits="userSpaceOnUse"><image xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="data:image/png;base64,${png}" width="20" height="20" clip-path="url(#c)" filter="url(#f)"/></mask></defs><rect width="20" height="20" mask="url(#m)"/></svg>`);
    assert.ok(result.document, result.error);
    for (const value of ['<image ', 'data:image/png;base64,', '<mask ', '<filter ', '<feColorMatrix ', 'mask="url(#vc-svg-', 'clip-path="url(#vc-svg-', 'filter="url(#vc-svg-']) assert.ok(result.document.includes(value), value);
    assert.ok(!/<use|xlink:|https:\/\/(?!www.w3.org)/.test(result.document));
});

test("rasters cannot load external/vector/animated payloads or excessive decoded dimensions", () => {
    for (const href of ['https://tracking.invalid/x.png', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/png;base64,AAAA']) {
        assert.ok(!parseSvg(`<svg><image href="${href}"/></svg>`).document!.includes('<image'));
    }
    const large = Buffer.from(png, 'base64'); large.writeUInt32BE(100000,16);
    assert.ok(!parseSvg(`<svg><image href="data:image/png;base64,${large.toString('base64')}"/></svg>`).document!.includes('<image'));
    const animated = Buffer.from(png, 'base64'); animated.write('acTL',12);
    assert.ok(!parseSvg(`<svg><image href="data:image/png;base64,${animated.toString('base64')}"/></svg>`).document!.includes('<image'));
});

test("recursive/external clone/effect references and expansive filter regions stay inert", () => {
    const document = parseSvg('<svg><defs><use id="loop" href="#loop"/><mask id="m" width="20" height="20"><rect mask="url(#m)"/></mask><filter id="f" width="4096" height="4096"><feImage href="https://tracking.invalid/x"/></filter></defs><use href="#loop"/><use href="https://tracking.invalid/x"/><rect filter="url(#f)"/></svg>').document!;
    assert.ok(!/<use|<feImage|<filter|tracking/.test(document));
    assert.ok(!document.includes('mask="'));
});

test("aggregate raster decode/count limits fail before browser rendering", () => {
    const large = Buffer.from(png, 'base64');
    large.writeUInt32BE(4000,16); large.writeUInt32BE(4000,20);
    const image = `<image href="data:image/png;base64,${large.toString('base64')}"/>`;
    assert.match(parseSvg('<svg>' + image.repeat(6) + '</svg>').error!, /complex/);
    assert.match(parseSvg('<svg>' + `<image href="data:image/png;base64,${png}"/>`.repeat(65) + '</svg>').error!, /complex/);
});

test("each path and the reduced AST retain finite budgets for large input", async () => {
    assert.ok((await parseSvgAsync('<svg><path d="M0 0 ' + 'L1 1 '.repeat(14000) + '"/></svg>'))?.error);
    assert.ok((await parseSvgAsync('<svg><rect unused="' + 'x'.repeat(140000) + '"/></svg>'))?.error);
    assert.ok(parseSvg('<svg><mask id="m" width="4096" height="4096"><rect/></mask><rect mask="url(#m)"/></svg>').document!.includes('<rect'));
    assert.ok(!parseSvg('<svg><mask id="m" width="4096" height="4096"><rect/></mask><rect mask="url(#m)"/></svg>').document!.includes('<mask'));
});
