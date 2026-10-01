/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Lexer, Token } from "./vendor/marked";

export const MAX_BYTES = 64 * 1024;
const MAX_LINES = 2000;
const MAX_LINE_LENGTH = 4096;
const MAX_NODES = 6000;
const MAX_DEPTH = 24;

export type PreviewTag = "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "pre" | "code" | "blockquote" | "ul" | "ol" | "li" | "strong" | "em" | "del" | "br" | "hr" | "a" | "span" | "table" | "thead" | "tbody" | "tr" | "th" | "td";
export type PreviewNode = string | { tag: PreviewTag; children: PreviewNode[]; href?: string; start?: number; align?: "left" | "center" | "right"; };
export type PreviewResult = { nodes: PreviewNode[]; error?: undefined; } | { nodes?: undefined; error: string; };

export function isMarkdownFilename(filename: unknown): filename is string {
    return typeof filename === "string" && /\.(?:md|markdown)$/i.test(filename);
}

export function safeLink(href: string): string | undefined {
    if (!/^https?:\/\//i.test(href) || /[\u0000-\u0020\u007f]/.test(href)) return;
    try {
        const url = new URL(href);
        if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url.href;
    } catch { /* Invalid links remain text. */ }
}

export function sourceProblem(source: unknown, bytesLeft: unknown): string | undefined {
    if (typeof source !== "string") return "Text is not loaded yet. Use Raw and try again once Discord loads the file.";
    if (typeof bytesLeft !== "number" || !Number.isFinite(bytesLeft) || bytesLeft < 0) return "Discord did not provide a complete preview. Use Raw or download the original.";
    if (bytesLeft > 0) return "Discord loaded only part of this file. Use Raw or download the original.";
    if (source.length > MAX_BYTES || new TextEncoder().encode(source).byteLength > MAX_BYTES) return "Preview is limited to 64 KiB. Use Raw or download the original.";
    const lines = source.split(/\r\n?|\n/);
    if (lines.length > MAX_LINES || lines.some(line => line.length > MAX_LINE_LENGTH)) return "This file exceeds the preview line limits. Use Raw or download the original.";
}

function decodeText(text: string): string {
    const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: "\u00a0" };
    return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (original, entity: string) => {
        if (entity[0] !== "#") return entities[entity.toLowerCase()] ?? original;
        const value = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : "\ufffd";
    });
}

export function parseMarkdown(source: string, bytesLeft = 0): PreviewResult {
    const problem = sourceProblem(source, bytesLeft);
    if (problem) return { error: problem };
    try {
        let count = 0;
        const node = (tag: PreviewTag, children: PreviewNode[], extra: Omit<Exclude<PreviewNode, string>, "tag" | "children"> = {}): PreviewNode => {
            if (++count > MAX_NODES) throw new Error();
            return { tag, children, ...extra };
        };
        const render = (tokens: Token[], depth = 0): PreviewNode[] => {
            if (depth > MAX_DEPTH) throw new Error();
            return tokens.flatMap((token): PreviewNode[] => {
                if (++count > MAX_NODES) throw new Error();
                const children = () => "tokens" in token && token.tokens ? render(token.tokens, depth + 1) : [decodeText("text" in token ? token.text : token.raw)];
                switch (token.type) {
                    case "space": case "def": return [];
                    case "heading": return [node(`h${token.depth}` as PreviewTag, children())];
                    case "paragraph": return [node("p", children())];
                    case "text": case "escape": return children();
                    case "html": return [token.raw];
                    case "code": return [node("pre", [node("code", [token.text])])];
                    case "codespan": return [node("code", [decodeText(token.text)])];
                    case "strong": case "em": case "del": case "blockquote": return [node(token.type, children())];
                    case "br": case "hr": return [node(token.type, [])];
                    case "link": {
                        const href = safeLink(token.href);
                        return [node(href ? "a" : "span", children(), href ? { href } : {})];
                    }
                    case "image": return [node("span", [`[Image: ${decodeText(token.text || "image")} — not loaded]`])];
                    case "list": return [node(token.ordered ? "ol" : "ul", token.items.map(item => {
                        const task = item.task ? [item.checked ? "☑ " : "☐ "] : [];
                        return node("li", [...task, ...render(item.tokens, depth + 1)]);
                    }), token.ordered && typeof token.start === "number" ? { start: token.start } : {})];
                    case "table": {
                        const row = (cells: typeof token.header, tag: "td" | "th") => node("tr", cells.map((cell, index) => node(tag, render(cell.tokens, depth + 1), token.align[index] ? { align: token.align[index] } : {})));
                        return [node("table", [node("thead", [row(token.header, "th")]), node("tbody", token.rows.map(cells => row(cells, "td")))])];
                    }
                    default: return [token.raw];
                }
            });
        };
        return { nodes: render(Lexer.lex(source, { gfm: true, breaks: false, pedantic: false })) };
    } catch {
        return { error: "This Markdown is too complex to preview safely. Use Raw or download the original." };
    }
}
