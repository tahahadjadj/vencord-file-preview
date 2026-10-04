/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isCsvFilename } from "./csv";
import { isMarkdownFilename, MAX_BYTES, sourceProblem } from "./markdown";
import { isSvgFilename } from "./svg";
import { parseFragment } from "./vendor/parse5";

export const MAX_HTML_BYTES = MAX_BYTES;
// Email templates nest layout tables more deeply than normal prose.
export const MAX_HTML_DEPTH = 64;

const allowed = new Set("p div span h1 h2 h3 h4 h5 h6 pre code blockquote ul ol li strong b em i del s u br hr table caption thead tbody tfoot tr th td dl dt dd sup sub small figure figcaption section article header footer main".split(" "));
const discarded = new Set("script style link meta base iframe object embed form input button textarea select option template noscript svg math audio video source track canvas portal frameset frame title".split(" "));
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export const HTML_CSP = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; font-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

// Theme selection is a fixed boolean, never attachment-controlled CSS.
const theme = (light: boolean) => `:root{color-scheme:${light ? "light" : "dark"}}body{margin:16px;font:15px system-ui;line-height:1.5;color:${light ? "#313338" : "#dbdee1"};background:${light ? "#fff" : "#2b2d31"};overflow-wrap:anywhere}h1,h2,h3,h4,h5,h6{line-height:1.25}pre,code{font-family:ui-monospace,monospace;background:${light ? "#f2f3f5" : "#202225"}}pre{padding:12px;overflow:auto;white-space:pre-wrap}blockquote{border-left:3px solid #949ba4;margin-left:0;padding-left:12px}table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #949ba4;padding:6px 10px}img{display:none}`;

export function isHtmlFilename(filename: unknown): filename is string {
    return typeof filename === "string" && /\.html?$/i.test(filename);
}

// Request complete bounded supported documents only from Discord attachment CDN URLs.
// One extra byte lets the parser reject files beyond the shared size limit.
export function attachmentPreviewRange(url: string): string {
    try {
        const parsed = new URL(url);
        if (parsed.protocol === "https:" && ["cdn.discordapp.com", "media.discordapp.net"].includes(parsed.hostname)
            && /^\/attachments\/\d+\/\d+\//.test(parsed.pathname) && (isHtmlFilename(parsed.pathname) || isMarkdownFilename(parsed.pathname) || isCsvFilename(parsed.pathname) || isSvgFilename(parsed.pathname)))
            return `bytes=0-${MAX_BYTES}`;
    } catch { /* Keep Discord's original range for unknown URLs. */ }
    return "bytes=0-50000";
}

export function parseHtml(source: string, bytesLeft = 0, light = false): { document?: string; error?: string; } {
    const problem = sourceProblem(source, bytesLeft, MAX_HTML_BYTES, MAX_HTML_BYTES);
    if (problem) return { error: problem };
    try {
        let count = 0;
        // parse5 builds a plain AST without a browser document or resource loads.
        const fragment = parseFragment(source);
        const render = (node: typeof fragment.childNodes[number], depth: number): string => {
            if (++count > 6000 || depth > MAX_HTML_DEPTH) throw new Error();
            if (node.nodeName === "#text") return escape((node as { value: string; }).value);
            if (!("tagName" in node)) return "";
            if (node.namespaceURI !== "http://www.w3.org/1999/xhtml" || discarded.has(node.tagName)) return "";
            if (node.tagName === "img") return escape(`[Image: ${node.attrs.find(attr => attr.name === "alt")?.value || "image"} — not loaded]`);
            const children = node.childNodes.map(child => render(child, depth + 1)).join("");
            if (!allowed.has(node.tagName)) return children;
            // No source attributes, IDs, CSS, URLs or event handlers survive.
            if (node.tagName === "br" || node.tagName === "hr") return `<${node.tagName}>`;
            return `<${node.tagName}>${children}</${node.tagName}>`;
        };
        const content = fragment.childNodes.map(node => render(node, 0)).join("");
        return { document: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escape(HTML_CSP)}"><meta name="referrer" content="no-referrer"><style>${theme(light)}</style></head><body>${content}</body></html>` };
    } catch {
        return { error: "This HTML is too complex to preview safely. Use Raw or download the original." };
    }
}
