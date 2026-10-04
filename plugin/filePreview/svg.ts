/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MAX_BYTES, sourceProblem } from "./markdown";
import { HtmlElement, HtmlNode, parseFragment } from "./vendor/parse5";

export const MAX_SVG_NODES = 2000;
export const MAX_SVG_DEPTH = 32;
export const MAX_SVG_NUMBERS = 20000;
export const MAX_SVG_PATH_COMMANDS = 4000;
export const MAX_SVG_PATH_LENGTH = 65536;
export const MAX_SVG_STYLE_RULES = 128;
export const MAX_SVG_OUTPUT_BYTES = 512 * 1024;
export const SVG_CSP = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; font-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

const namespace = "http://www.w3.org/2000/svg";
const tags = new Set("svg g defs path rect circle ellipse line polyline polygon text tspan title desc linearGradient radialGradient stop clipPath".split(" "));
const textTags = new Set(["text", "tspan", "title", "desc"]);
const lengths = new Set("x y x1 y1 x2 y2 cx cy r rx ry width height dx dy stroke-width stroke-dashoffset stroke-miterlimit textLength pathLength letter-spacing word-spacing".split(" "));
const properties = new Set("fill stroke color opacity fill-opacity stroke-opacity stroke-width stroke-dasharray stroke-dashoffset stroke-miterlimit stroke-linecap stroke-linejoin fill-rule clip-rule clip-path font-size font-family font-weight font-style text-anchor dominant-baseline visibility display vector-effect paint-order shape-rendering text-rendering stop-color stop-opacity letter-spacing word-spacing width height transform".split(" "));
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
    "lengthAdjust": ["spacing", "spacingAndGlyphs"]
};
const numberPattern = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const identifier = /^[A-Za-z_][\w.-]{0,63}$/;
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
type StyleRule = { selector: string; declarations: Record<string, string>; specificity: number; };

export function isSvgFilename(filename: unknown): filename is string {
    return typeof filename === "string" && /\.svg$/i.test(filename);
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

export function parseSvg(source: string, bytesLeft = 0, light = false): { document?: string; error?: string; } {
    const problem = sourceProblem(source, bytesLeft, MAX_BYTES, MAX_BYTES);
    if (problem) return { error: problem };
    try {
        // Bound the AST workload before handing potentially foreign markup to parse5.
        if ((source.match(/</g)?.length ?? 0) > MAX_SVG_NODES * 2) throw new Error();
        const fragment = parseFragment(source);
        const roots = fragment.childNodes.filter((node): node is HtmlElement => "tagName" in node && node.tagName === "svg" && node.namespaceURI === namespace);
        if (roots.length !== 1) return { error: "This file does not contain one SVG drawing. Use Raw or download the original." };
        const root = roots[0];
        const ids = new Map<string, { id: string; tag: string; }>();
        const rules: StyleRule[] = [];
        let nodes = 0;
        const scan = (node: HtmlNode, depth: number, enabled: boolean) => {
            if (++nodes > MAX_SVG_NODES || depth > MAX_SVG_DEPTH) throw new Error();
            if (!("tagName" in node)) return;
            enabled = enabled && node.namespaceURI === namespace && (tags.has(node.tagName) || ["style", "a", "switch"].includes(node.tagName));
            if (enabled) {
                const id = node.attrs.find(attribute => attribute.name === "id")?.value;
                if (id && identifier.test(id)) {
                    if (ids.has(id) || ids.size >= 512) throw new Error();
                    ids.set(id, { id: `vc-svg-${ids.size}`, tag: node.tagName });
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
            node.childNodes.forEach(child => scan(child, depth + 1, enabled));
        };
        scan(root, 0, true);
        rules.sort((a, b) => a.specificity - b.specificity);

        let numbers = 0;
        let commands = 0;
        let output = 0;
        let textLength = 0;
        const checkNumbers = (value: string) => {
            const values = value.match(numberPattern) ?? [];
            numbers += values.length;
            if (numbers > MAX_SVG_NUMBERS) throw new Error();
            return values.length > 0 && values.every(number => Number.isFinite(Number(number)) && Math.abs(Number(number)) <= 1e6);
        };
        const validColor = (value: string) => /^(?:#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})|[a-z]{1,32})$/i.test(value)
            || (/^(?:rgb|rgba|hsl|hsla)\([\d.,%+\-\seE/]+\)$/i.test(value) && checkNumbers(value));
        const attributeValue = (name: string, value: string, tag: string, insideClip: boolean): string | undefined => {
            value = value.trim();
            if (name === "id") return ids.get(value)?.id;
            if (name === "fill" || name === "stroke" || name === "clip-path") {
                const reference = value.match(/^url\(\s*['"]?#([A-Za-z_][\w.-]{0,63})['"]?\s*\)$/);
                if (reference) {
                    const target = ids.get(reference[1]);
                    if (name === "clip-path") return !insideClip && target?.tag === "clipPath" ? `url(#${target.id})` : undefined;
                    return target && ["linearGradient", "radialGradient"].includes(target.tag) ? `url(#${target.id})` : undefined;
                }
                return name === "clip-path" ? value === "none" ? value : undefined : validColor(value) ? value : undefined;
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
        const render = (node: HtmlNode, parentTag = "", insideClip = false): string => {
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
            insideClip ||= tag === "clipPath";
            const values: Record<string, string> = {};
            for (const attribute of node.attrs) {
                if (("namespace" in attribute && attribute.namespace) || ("prefix" in attribute && attribute.prefix)) continue;
                values[attribute.name] = attribute.value;
            }
            const classes = new Set((values.class ?? "").split(/\s+/));
            for (const rule of rules) {
                const matches = rule.selector[0] === "." ? classes.has(rule.selector.slice(1)) : rule.selector[0] === "#" ? values.id === rule.selector.slice(1) : node.tagName.toLowerCase() === rule.selector.toLowerCase();
                if (matches) Object.assign(values, rule.declarations);
            }
            Object.assign(values, declarations(values.style ?? ""));
            const attrs = Object.entries(values).flatMap(([name, value]) => {
                const safe = attributeValue(name, value, tag, insideClip);
                return safe === undefined ? [] : [` ${name}="${escape(safe)}"`];
            }).join("");
            const start = charge(`<${tag}${node === root ? ' xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SVG attachment preview"' : ""}${attrs}>`);
            const children = tag === "stop" ? "" : node.childNodes.filter(child => !["linearGradient", "radialGradient"].includes(tag) || ("tagName" in child && child.tagName === "stop")).map(child => render(child, tag, insideClip)).join("");
            return start + children + charge(`</${tag}>`);
        };
        const content = render(root);
        if (new TextEncoder().encode(content).byteLength > MAX_SVG_OUTPUT_BYTES) throw new Error();
        const css = `:root{color-scheme:${light ? "light" : "dark"}}body{margin:12px;background:#fff;color:#313338;font:16px system-ui;display:flex;justify-content:center}svg{display:block;max-width:100%;max-height:480px;pointer-events:none}`;
        return { document: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escape(SVG_CSP)}"><meta name="referrer" content="no-referrer"><style>${css}</style></head><body>${content}</body></html>` };
    } catch {
        return { error: "This SVG is too complex to preview safely. Use Raw or download the original." };
    }
}
