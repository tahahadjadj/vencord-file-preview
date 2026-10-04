/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { sourceProblem } from "./markdown";
import { HtmlElement, HtmlNode, parseFragment } from "./vendor/parse5";

export const MAX_SVG_NODES = 10000;
export const MAX_SVG_DEPTH = 32;
export const MAX_SVG_NUMBERS = 400000;
export const MAX_SVG_PATH_COMMANDS = 100000;
export const MAX_SVG_PATH_LENGTH = 65536;
export const MAX_SVG_STYLE_RULES = 256;
export const MAX_SVG_OUTPUT_BYTES = 8 * 1024 * 1024;
export const MAX_SVG_BYTES = 8 * 1024 * 1024;
export const MAX_SVG_PREPARED_BYTES = 3 * 1024 * 1024;
export const SVG_CSP = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src data:; media-src 'none'; object-src 'none'; frame-src 'none'; font-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

const namespace = "http://www.w3.org/2000/svg";
const tags = new Set("svg g defs path rect circle ellipse line polyline polygon text tspan title desc linearGradient radialGradient stop clipPath mask image use filter feColorMatrix".split(" "));
const textTags = new Set(["text", "tspan", "title", "desc"]);
const lengths = new Set("x y x1 y1 x2 y2 cx cy r rx ry width height dx dy stroke-width stroke-dashoffset stroke-miterlimit textLength pathLength letter-spacing word-spacing".split(" "));
const properties = new Set("fill stroke color opacity fill-opacity stroke-opacity stroke-width stroke-dasharray stroke-dashoffset stroke-miterlimit stroke-linecap stroke-linejoin fill-rule clip-rule clip-path font-size font-family font-weight font-style text-anchor dominant-baseline visibility display vector-effect paint-order shape-rendering text-rendering stop-color stop-opacity mask filter letter-spacing word-spacing width height transform".split(" "));
const enums: Record<string, string[]> = {
    "stroke-linecap": ["butt", "round", "square"],
    "stroke-linejoin": ["miter", "miter-clip", "round", "bevel", "arcs"],
    "fill-rule": ["nonzero", "evenodd"],
    "clip-rule": ["nonzero", "evenodd"],
    "text-anchor": ["start", "middle", "end"],
    "font-style": ["normal", "italic", "oblique"],
    "visibility": ["visible", "hidden", "collapse"],
    "display": ["none", "inline", "block"],
    "vector-effect": ["none", "non-scaling-stroke"],
    "shape-rendering": ["auto", "optimizeSpeed", "crispEdges", "geometricPrecision"],
    "text-rendering": ["auto", "optimizeSpeed", "optimizeLegibility", "geometricPrecision"],
    "dominant-baseline": ["auto", "middle", "central", "hanging", "alphabetic", "text-before-edge", "text-after-edge", "ideographic"],
    "gradientUnits": ["userSpaceOnUse", "objectBoundingBox"],
    "clipPathUnits": ["userSpaceOnUse", "objectBoundingBox"],
    "spreadMethod": ["pad", "reflect", "repeat"],
    "maskUnits": ["userSpaceOnUse", "objectBoundingBox"],
    "maskContentUnits": ["userSpaceOnUse", "objectBoundingBox"],
    "filterUnits": ["userSpaceOnUse", "objectBoundingBox"],
    "lengthAdjust": ["spacing", "spacingAndGlyphs"]
};
const numberPattern = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const identifier = /^[A-Za-z_][\w.-]{0,63}$/;
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
type StyleRule = { selector: string; declarations: Record<string, string>; specificity: number; };
export type SvgResult = { document?: string; error?: string; };

export function isSvgFilename(filename: unknown): filename is string {
    return typeof filename === "string" && /\.svg$/i.test(filename);
}

export function svgSourceProblem(source: unknown, bytesLeft: unknown): string | undefined {
    if (typeof source !== "string" || typeof bytesLeft !== "number" || !Number.isFinite(bytesLeft) || bytesLeft < 0 || bytesLeft > 0) return sourceProblem(source, bytesLeft);
    if (source.length > MAX_SVG_BYTES || new TextEncoder().encode(source).byteLength > MAX_SVG_BYTES) return "SVG preview is limited to 8 MiB. Use Raw or download the original.";
}

export function svgAttachmentUrl(value: unknown): string | undefined {
    if (typeof value !== "string") return;
    try {
        const url = new URL(value);
        if (url.protocol === "https:" && !url.username && !url.password && !url.port && ["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname)
            && /^\/attachments\/\d+\/\d+\//.test(url.pathname) && isSvgFilename(url.pathname)) return url.href;
    } catch { /* Unknown URLs cannot fetch a full drawing. */ }
}

export function svgLoadProblem(url: unknown, size: unknown): string | undefined {
    if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) return "Discord did not provide the SVG file size. Use Raw or download the original.";
    if (size > MAX_SVG_BYTES) return "SVG preview is limited to 8 MiB. Use Raw or download the original.";
    if (!svgAttachmentUrl(url)) return "Discord did not provide a supported SVG attachment URL. Use Raw or download the original.";
}

export async function loadSvgSource(url: string, size: number, signal: AbortSignal, request: typeof fetch = fetch): Promise<string> {
    const problem = svgLoadProblem(url, size);
    if (problem) throw new Error(problem);
    const response = await request(svgAttachmentUrl(url)!, { headers: { Range: `bytes=0-${MAX_SVG_BYTES - 1}` }, signal, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" });
    if (!response.ok || !response.body) throw new Error("Discord could not load this SVG. Use Raw or download the original.");
    const length = response.headers.get("Content-Length");
    if (length && Number(length) > MAX_SVG_BYTES) {
        await response.body.cancel();
        throw new Error("SVG preview is limited to 8 MiB. Use Raw or download the original.");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
        while (true) {
            if (signal.aborted) { await reader.cancel(); throw new Error("SVG loading cancelled."); }
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            if (received > MAX_SVG_BYTES || received > size) {
                await reader.cancel();
                throw new Error("Discord returned an oversized or unexpected SVG. Use Raw or download the original.");
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    if (received !== size) throw new Error("Discord loaded only part of this SVG. Use Raw or download the original.");
    const data = new Uint8Array(received);
    let position = 0;
    for (const chunk of chunks) { data.set(chunk, position); position += chunk.byteLength; }
    try { return new TextDecoder("utf-8", { fatal: true }).decode(data); }
    catch { throw new Error("This SVG is not valid UTF-8 text. Use Raw or download the original."); }
}

// Reduce ignored payloads before AST parsing. This is a workload reducer, not the sanitizer.
// The existing namespace/attribute allowlist still validates every emitted drawing node.
function* prepareSvg(source: string, rasters: Map<string, string>): Generator<void, string> {
    const parts: string[] = [];
    const stack: string[] = [];
    const supported = new Set([...tags].map(tag => tag.toLowerCase()).concat("style", "a", "switch"));
    let position = 0, checkpoint = 0, prepared = 0, tokens = 0;
    let discarded = "", discardDepth = 0;
    const append = (value: string) => {
        prepared += value.length;
        if (prepared > MAX_SVG_PREPARED_BYTES) throw new Error();
        parts.push(value);
    };
    while (position < source.length) {
        const open = source.indexOf("<", position);
        const text = source.slice(position, open < 0 ? source.length : open);
        if (!discarded && stack.some(tag => textTags.has(tag) || tag === "style")) append(text);
        if (open < 0) break;
        if (++tokens > MAX_SVG_NODES * 2) throw new Error();
        if (source.startsWith("<!--", open)) {
            const close = source.indexOf("-->", open + 4);
            if (close < 0) throw new Error();
            position = close + 3;
        } else if (source.startsWith("<![CDATA[", open)) {
            const close = source.indexOf("]]>", open + 9);
            if (close < 0) throw new Error();
            if (!discarded && stack.some(tag => textTags.has(tag) || tag === "style")) append(source.slice(open, close + 3));
            position = close + 3;
        } else {
            const name = source.slice(open, open + 128).match(/^<\s*(\/?)\s*([A-Za-z_][\w:.-]*)/);
            const tag = name?.[2].toLowerCase() ?? "";
            const closing = name?.[1] === "/";
            const ignored = !!discarded || !supported.has(tag);
            let quote = "", brackets = 0, end = open + 1;
            for (; end < source.length; end++) {
                const char = source[end];
                if (quote) { if (char === quote) quote = ""; }
                else if (char === '"' || char === "'") quote = char;
                else if (source.startsWith("<!", open) && char === "[") brackets++;
                else if (brackets && char === "]") brackets--;
                else if (char === ">" && !brackets) break;
                if (!ignored && tag !== "image" && end - open > MAX_SVG_PATH_LENGTH * 2) throw new Error();
                if (end - checkpoint >= 65536) { checkpoint = end; yield; }
            }
            if (end >= source.length) throw new Error();
            let token = source.slice(open, end + 1);
            if (!discarded && tag === "image") {
                token = token.replace(/((?:xlink:)?href\s*=\s*)(["'])([\s\S]*?)\2/g, (attribute, prefix, quote, value) => {
                    if (!/^data:image\/(?:png|jpeg);base64,/.test(value)) return attribute;
                    if (rasters.size >= 64) throw new Error();
                    const key = `vc-raster-${rasters.size}`;
                    rasters.set(key, value);
                    return prefix + quote + key + quote;
                });
            }
            const selfClosing = /\/\s*>$/.test(token);
            if (discarded) {
                if (tag === discarded) {
                    if (closing) discardDepth--;
                    else if (!selfClosing) discardDepth++;
                    if (!discardDepth) discarded = "";
                }
            } else if (!supported.has(tag)) {
                if (tag && !closing && !selfClosing) { discarded = tag; discardDepth = 1; }
            } else {
                append(token);
                if (closing) {
                    if (stack.pop() !== tag) throw new Error();
                } else if (!selfClosing) {
                    stack.push(tag);
                    if (stack.length > MAX_SVG_DEPTH + 1) throw new Error();
                }
            }
            position = end + 1;
        }
        if (position - checkpoint >= 65536) { checkpoint = position; yield; }
    }
    if (discarded || stack.length) throw new Error();
    const result = parts.join("");
    if (new TextEncoder().encode(result).byteLength > MAX_SVG_PREPARED_BYTES) throw new Error();
    return result;
}

export async function parseSvgAsync(source: string, bytesLeft = 0, light = false, cancelled = () => false): Promise<SvgResult | undefined> {
    const problem = svgSourceProblem(source, bytesLeft);
    if (problem) return { error: problem };
    try {
        const rasters = new Map<string, string>();
        const steps = prepareSvg(source, rasters);
        await new Promise(resolve => setTimeout(resolve, 0));
        while (!cancelled()) {
            const step = steps.next();
            if (step.done) {
                const rendering = parsePreparedSvg(step.value, light, rasters);
                while (!cancelled()) {
                    const result = rendering.next();
                    if (result.done) return result.value;
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    } catch { return { error: "This SVG is too complex to preview safely. Use Raw or download the original." }; }
}

function declarations(source: string): Record<string, string> {
    if (source.length > 4096) throw new Error();
    const result: Record<string, string> = {};
    const items = source.split(";");
    if (items.length > 64) throw new Error();
    for (const item of items) {
        const colon = item.indexOf(":");
        if (colon < 0) continue;
        const property = item.slice(0, colon).trim().toLowerCase();
        if (properties.has(property)) result[property] = item.slice(colon + 1).trim().replace(/\s*!important\s*$/i, "");
    }
    return result;
}

function stripComments(source: string): string {
    let result = "";
    let position = 0;
    while (position < source.length) {
        const open = source.indexOf("/*", position);
        if (open < 0) return result + source.slice(position);
        result += source.slice(position, open);
        const close = source.indexOf("*/", open + 2);
        if (close < 0) break;
        position = close + 2;
    }
    return result;
}

function rasterData(value: string | undefined): { url: string; pixels: number; } | undefined {
    const match = value?.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=\s]+)$/);
    if (!match) return;
    const encoded = match[2].replace(/\s/g, "");
    if (encoded.length > 3 * 1024 * 1024 || encoded.length % 4) return;
    let binary: string;
    try { binary = atob(encoded); } catch { return; }
    const byte = (position: number) => binary.charCodeAt(position);
    const uint = (position: number, length: number) => {
        let result = 0;
        for (let index = 0; index < length; index++) result = result * 256 + byte(position + index);
        return result;
    };
    let width = 0, height = 0;
    if (match[1] === "png") {
        if (binary.slice(0, 8) !== "\x89PNG\r\n\x1a\n" || binary.slice(12, 16) !== "IHDR" || binary.length < 33) return;
        width = uint(16, 4); height = uint(20, 4);
        let position = 8, ended = false;
        while (position + 12 <= binary.length) {
            const length = uint(position, 4), kind = binary.slice(position + 4, position + 8);
            if (kind === "acTL" || length > binary.length - position - 12) return;
            position += length + 12;
            if (kind === "IEND") { ended = position === binary.length; break; }
        }
        if (!ended) return;
    } else {
        if (uint(0, 2) !== 0xffd8 || uint(binary.length - 2, 2) !== 0xffd9) return;
        let position = 2;
        while (position + 9 < binary.length && position < 65536) {
            if (byte(position) !== 255) return;
            const marker = byte(position + 1), length = uint(position + 2, 2);
            if (length < 2 || position + 2 + length > binary.length) return;
            if ([0xc0, 0xc2].includes(marker)) { height = uint(position + 5, 2); width = uint(position + 7, 2); break; }
            position += length + 2;
        }
    }
    const pixels = width * height;
    if (!width || !height || width > 8192 || height > 8192 || pixels > 16 * 1024 * 1024) return;
    return { url: `data:image/${match[1]};base64,${encoded}`, pixels };
}

export function parseSvg(source: string, bytesLeft = 0, light = false): { document?: string; error?: string; } {
    const problem = svgSourceProblem(source, bytesLeft);
    if (problem) return { error: problem };
    try {
        const rasters = new Map<string, string>();
        const steps = prepareSvg(source, rasters);
        let step = steps.next();
        while (!step.done) step = steps.next();
        const rendering = parsePreparedSvg(step.value, light, rasters);
        let result = rendering.next();
        while (!result.done) result = rendering.next();
        return result.value;
    } catch { return { error: "This SVG is too complex to preview safely. Use Raw or download the original." }; }
}

function* parsePreparedSvg(source: string, light: boolean, rasters: Map<string, string>): Generator<void, SvgResult> {
    try {
        // Bound the AST workload before handing potentially foreign markup to parse5.
        if ((source.match(/</g)?.length ?? 0) > MAX_SVG_NODES * 2) throw new Error();
        const fragment = parseFragment(source);
        const roots = fragment.childNodes.filter((node): node is HtmlElement => "tagName" in node && node.tagName === "svg" && node.namespaceURI === namespace);
        if (roots.length !== 1) return { error: "This file does not contain one SVG drawing. Use Raw or download the original." };
        const root = roots[0];
        const ids = new Map<string, { id: string; tag: string; node: HtmlElement; }>();
        const rules: StyleRule[] = [];
        let nodes = 0;
        function* scan(node: HtmlNode, depth: number, enabled: boolean): Generator<void> {
            if (++nodes > MAX_SVG_NODES || depth > MAX_SVG_DEPTH) throw new Error();
            if (nodes % 64 === 0) yield;
            if (!("tagName" in node)) return;
            enabled = enabled && node.namespaceURI === namespace && (tags.has(node.tagName) || ["style", "a", "switch"].includes(node.tagName));
            if (["mask", "filter"].includes(node.tagName)) {
                const dimension = (name: string) => node.attrs.find(attribute => attribute.name === name)?.value ?? "";
                const width = Number(dimension("width")), height = Number(dimension("height"));
                enabled &&= width > 0 && height > 0 && width <= 4096 && height <= 4096 && width * height <= 2 * 1024 * 1024;
            }
            if (enabled) {
                const id = node.attrs.find(attribute => attribute.name === "id")?.value;
                if (id && identifier.test(id)) {
                    if (ids.has(id) || ids.size >= 512) throw new Error();
                    ids.set(id, { id: `vc-svg-${ids.size}`, tag: node.tagName, node });
                }
                if (node.tagName === "style") {
                    let css = node.childNodes.filter(child => child.nodeName === "#text").map(child => (child as { value: string; }).value).join("");
                    if (css.length > 32768) throw new Error();
                    css = stripComments(css);
                    let position = 0;
                    while (position < css.length) {
                        const open = css.indexOf("{", position);
                        if (open < 0) break;
                        const close = css.indexOf("}", open + 1);
                        if (close < 0) break;
                        const selectorText = css.slice(position, open).trim();
                        const values = declarations(css.slice(open + 1, close));
                        position = close + 1;
                        for (const selector of selectorText.split(",").map(value => value.trim())) {
                            if (!/^[.#]?[A-Za-z_][\w-]{0,63}$/.test(selector)) continue;
                            if (rules.length >= MAX_SVG_STYLE_RULES) throw new Error();
                            rules.push({ selector, declarations: values, specificity: selector[0] === "#" ? 100 : selector[0] === "." ? 10 : 1 });
                        }
                    }
                }
            }
            for (const child of node.childNodes) yield* scan(child, depth + 1, enabled);
        }
        yield* scan(root, 0, true);
        rules.sort((a, b) => a.specificity - b.specificity);

        let numbers = 0;
        let commands = 0;
        let output = 0;
        let textLength = 0;
        let imagePixels = 0;
        let images = 0;
        let effects = 0;
        const checkNumbers = (value: string) => {
            const values = value.match(numberPattern) ?? [];
            numbers += values.length;
            if (numbers > MAX_SVG_NUMBERS) throw new Error();
            return values.length > 0 && values.every(number => Number.isFinite(Number(number)) && Math.abs(Number(number)) <= 1e6);
        };
        const validColor = (value: string) => /^(?:#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})|[a-z]{1,32})$/i.test(value)
            || (/^(?:rgb|rgba|hsl|hsla)\([\d.,%+\-\seE/]+\)$/i.test(value) && checkNumbers(value));
        const attributeValue = (name: string, value: string, tag: string, insideEffect: string): string | undefined => {
            value = value.trim();
            if (name === "id") return ids.get(value)?.id;
            if (name === "fill" || name === "stroke" || ["clip-path", "mask", "filter"].includes(name)) {
                const reference = value.match(/^url\(\s*['"]?#([A-Za-z_][\w.-]{0,63})['"]?\s*\)$/);
                if (reference) {
                    const target = ids.get(reference[1]);
                    if (["clip-path", "mask", "filter"].includes(name)) {
                        const kind = name === "clip-path" ? "clipPath" : name;
                        if (name !== "clip-path" && ++effects > 32) throw new Error();
                        const allowed = kind === "clipPath" ? insideEffect !== "clipPath" : kind === "mask" ? !insideEffect : !["filter", "clipPath"].includes(insideEffect);
                        return allowed && target?.tag === kind ? `url(#${target.id})` : undefined;
                    }
                    return target && ["linearGradient", "radialGradient"].includes(target.tag) ? `url(#${target.id})` : undefined;
                }
                return ["clip-path", "mask", "filter"].includes(name) ? value === "none" ? value : undefined : validColor(value) ? value : undefined;
            }
            if (tag === "feColorMatrix" && name === "type") return value === "matrix" ? value : undefined;
            if (tag === "feColorMatrix" && name === "values") {
                const values = value.split(/[\s,]+/).map(Number);
                return values.length === 20 && values.every(number => Number.isFinite(number) && Math.abs(number) <= 4) ? values.join(" ") : undefined;
            }
            if (name === "color" || name === "stop-color") return validColor(value) ? value : undefined;
            if (["opacity", "fill-opacity", "stroke-opacity", "stop-opacity"].includes(name))
                return /^\d*\.?\d+$/.test(value) && Number(value) >= 0 && Number(value) <= 1 ? value : undefined;
            if (name === "viewBox") {
                if (!/^[\d+\-.,\seE]+$/.test(value) || !checkNumbers(value)) return;
                const values = value.trim().split(/[\s,]+/).map(Number);
                return values.length === 4 && values[2] >= 1e-6 && values[3] >= 1e-6 ? values.join(" ") : undefined;
            }
            if (name === "preserveAspectRatio") return /^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?:\s+(?:meet|slice))?)$/.test(value) ? value : undefined;
            if (name === "d" || name === "points") {
                if (value.length > MAX_SVG_PATH_LENGTH) throw new Error();
                if (!(name === "d" ? /^[MmZzLlHhVvCcSsQqTtAa\d+\-.,\seE]+$/ : /^[\d+\-.,\seE]+$/).test(value) || !checkNumbers(value)) return;
                commands += (value.match(/[MmZzLlHhVvCcSsQqTtAa]/g) ?? []).length;
                if (commands > MAX_SVG_PATH_COMMANDS) throw new Error();
                return value;
            }
            if (["transform", "gradientTransform"].includes(name)) {
                if (value.length > 1024 || !/^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([\d+\-.,\seE]+\)[\s,]*)+$/.test(value) || !checkNumbers(value)) return;
                return value;
            }
            if (name === "font-size") return /^\d*\.?\d+(?:px|pt)?$/.test(value) && parseFloat(value) <= (value.endsWith("pt") ? 384 : 512) ? value : undefined;
            if (name === "font-family") return /^[\w\s,'"-]{1,128}$/.test(value) ? value : undefined;
            if (name === "font-weight") return /^(?:normal|bold|bolder|lighter|[1-9]00)$/.test(value) ? value : undefined;
            if (name === "stroke-dasharray") return value === "none" || (/^[\d+\-.,\s%pxeE]+$/.test(value) && value.length <= 512 && checkNumbers(value)) ? value : undefined;
            if (name === "offset") return /^\d*\.?\d+%?$/.test(value) && parseFloat(value) <= (value.endsWith("%") ? 100 : 1) ? value : undefined;
            if (name === "paint-order") return /^(?:normal|(?:fill|stroke|markers)(?:\s+(?:fill|stroke|markers)){0,2})$/.test(value) ? value : undefined;
            if (Object.hasOwn(enums, name)) return enums[name].includes(value) ? value : undefined;
            if (lengths.has(name)) {
                if (value.length > 512 || !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?(?:%|px|pt|em|ex|cm|mm|in)?$/.test(value) || !checkNumbers(value)) return;
                if (tag === "svg" && ["width", "height"].includes(name) && (parseFloat(value) <= 0 || parseFloat(value) > (value.endsWith("%") ? 100 : 4096) || /(?:pt|em|ex|cm|mm|in)$/.test(value))) return;
                return value;
            }
        };
        const charge = (value: string) => {
            output += value.length;
            if (output > MAX_SVG_OUTPUT_BYTES) throw new Error();
            return value;
        };
        let rendered = 0;
        function* render(node: HtmlNode, parentTag = "", insideEffect = "", clone = false): Generator<void, string> {
            if (++rendered % 64 === 0) yield;
            if (node.nodeName === "#text") {
                if (!textTags.has(parentTag)) return "";
                const { value } = node as { value: string; };
                textLength += value.length;
                if (value.length > 8192 || textLength > 16384) throw new Error();
                return charge(escape(value));
            }
            if (!("tagName" in node) || node.namespaceURI !== namespace) return "";
            const tag = ["a", "switch"].includes(node.tagName) ? "g" : node.tagName;
            if (!tags.has(tag)) return "";
            if (tag === "use") {
                const href = node.attrs.find(attribute => attribute.name === "href")?.value;
                const target = href?.startsWith("#") ? ids.get(href.slice(1)) : undefined;
                if (!target || !["rect", "path", "polygon", "circle", "ellipse", "line", "polyline"].includes(target.tag)) return "";
                return yield* render(target.node, parentTag, insideEffect, true);
            }
            if (["clipPath", "mask", "filter"].includes(tag)) insideEffect = tag;
            const values: Record<string, string> = {};
            for (const attribute of node.attrs) {
                if (tag === "image" && attribute.name === "href") { values.href = attribute.value; continue; }
                if (("namespace" in attribute && attribute.namespace) || ("prefix" in attribute && attribute.prefix)) continue;
                values[attribute.name] = attribute.value;
            }
            const classes = new Set((values.class ?? "").split(/\s+/));
            for (const rule of rules) {
                const matches = rule.selector[0] === "." ? classes.has(rule.selector.slice(1)) : rule.selector[0] === "#" ? values.id === rule.selector.slice(1) : node.tagName.toLowerCase() === rule.selector.toLowerCase();
                if (matches) Object.assign(values, rule.declarations);
            }
            Object.assign(values, declarations(values.style ?? ""));
            if (clone) delete values.id;
            if (node === root && values.viewBox) {
                const view = values.viewBox.trim().split(/[\s,]+/).map(Number);
                if (view.length === 4 && view[2] > 0 && view[3] > 0 && view[2] <= 4096 && view[3] <= 4096) {
                    values.width ??= String(view[2]);
                    values.height ??= String(view[3]);
                }
            }
            if (["mask", "filter"].includes(tag)) {
                const width = parseFloat(values.width ?? "0"), height = parseFloat(values.height ?? "0");
                if (!(width > 0 && height > 0) || width > 4096 || height > 4096 || width * height > 2 * 1024 * 1024 || /%/.test((values.width ?? "") + (values.height ?? ""))) return "";
            }
            let raster = "";
            if (tag === "image") {
                const image = rasterData(rasters.get(values.href));
                if (!image) return "";
                imagePixels += image.pixels;
                if (++images > 64 || imagePixels > 80 * 1024 * 1024) throw new Error();
                raster = ` href="${image.url}"`;
            }
            const attrs = Object.entries(values).flatMap(([name, value]) => {
                const safe = attributeValue(name, value, tag, insideEffect);
                return safe === undefined ? [] : [` ${name}="${escape(safe)}"`];
            }).join("");
            const start = charge(`<${tag}${node === root ? ' xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SVG attachment preview"' : ""}${attrs}${raster}>`);
            const children: string[] = [];
            if (!["stop", "image", "feColorMatrix"].includes(tag)) {
                for (const child of node.childNodes) {
                    if (tag === "filter" && (!("tagName" in child) || child.tagName !== "feColorMatrix")) continue;
                    if (["linearGradient", "radialGradient"].includes(tag) && (!("tagName" in child) || child.tagName !== "stop")) continue;
                    children.push(yield* render(child, tag, insideEffect));
                }
            }
            return start + children.join("") + charge(`</${tag}>`);
        }
        const content = yield* render(root);
        if (new TextEncoder().encode(content).byteLength > MAX_SVG_OUTPUT_BYTES) throw new Error();
        const css = `:root{color-scheme:${light ? "light" : "dark"}}body{margin:12px;background:#fff;color:#313338;font:16px system-ui;display:flex;justify-content:center}svg{display:block;max-width:100%;height:auto;pointer-events:none}`;
        return { document: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escape(SVG_CSP)}"><meta name="referrer" content="no-referrer"><style>${css}</style></head><body>${content}</body></html>` };
    } catch {
        return { error: "This SVG is too complex to preview safely. Use Raw or download the original." };
    }
}
