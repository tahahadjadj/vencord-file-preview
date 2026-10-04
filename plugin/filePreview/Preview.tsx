/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, ThemeStore, useMemo, useState, useStateFromStores } from "@webpack/common";

import { isCsvFilename, parseCsv } from "./csv";
import { isHtmlFilename, MAX_HTML_BYTES, parseHtml } from "./html";
import { parseMarkdown, PreviewNode, sourceProblem } from "./markdown";

export interface PreviewProps {
    fileName: string;
    fileContents: string;
    bytesLeft: number;
    raw: React.ReactNode;
}

function renderNodes(nodes: PreviewNode[]): React.ReactNode {
    return nodes.map((node, key) => {
        if (typeof node === "string") return node;
        const props: Record<string, unknown> = { key };
        if (node.tag === "a") Object.assign(props, { href: node.href, target: "_blank", rel: "noopener noreferrer", referrerPolicy: "no-referrer" });
        if (node.tag === "ol" && node.start != null) props.start = node.start;
        if (node.align) props.style = { textAlign: node.align };
        // React rejects even an empty children array on void elements.
        if (node.tag === "br" || node.tag === "hr") return React.createElement(node.tag, props);
        return React.createElement(node.tag, props, renderNodes(node.children));
    });
}

function CsvTable({ rows, fileName }: { rows: string[][]; fileName: string; }) {
    if (!rows.length) return <p className="vc-file-notice" role="status">This CSV is empty.</p>;
    return (
        <table className="vc-file-csv">
            <caption>{fileName} — {rows.length} {rows.length === 1 ? "row" : "rows"}</caption>
            <thead><tr>{rows[0].map((_, column) => <th key={column} scope="col">Column {column + 1}</th>)}</tr></thead>
            <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody>
        </table>
    );
}

export function FilePreview({ fileName, fileContents, bytesLeft, raw }: PreviewProps) {
    const [preview, setPreview] = useState(false);
    const id = React.useId();
    const html = isHtmlFilename(fileName);
    const csv = isCsvFilename(fileName);
    const light = useStateFromStores([ThemeStore], () => ThemeStore.theme === "light");
    const problem = sourceProblem(fileContents, bytesLeft, undefined, html || csv ? MAX_HTML_BYTES : undefined);
    const result = useMemo(() => preview ? html ? parseHtml(fileContents, bytesLeft, light) : csv ? parseCsv(fileContents, bytesLeft) : parseMarkdown(fileContents, bytesLeft) : undefined, [preview, html, csv, fileContents, bytesLeft, light]);
    const error = problem ?? result?.error;
    const nodes = result && "nodes" in result ? result.nodes : undefined;
    const htmlDocument = result && "document" in result ? result.document : undefined;
    const rows = result && "rows" in result ? result.rows : undefined;
    const showPreview = preview && (nodes != null || htmlDocument != null || rows != null);

    return (
        <section className="vc-file-preview" aria-label={`File attachment: ${fileName}`}>
            <div className="vc-file-toolbar" role="group" aria-label="File view">
                <button type="button" aria-pressed={!showPreview} aria-controls={`${id}-raw`} onClick={() => setPreview(false)}>Raw</button>
                <button type="button" aria-pressed={showPreview} aria-controls={`${id}-rich`} disabled={!!problem} onClick={() => setPreview(true)}>Preview</button>
                <span className="vc-file-hint">{html ? "HTML scripts, styles, images and navigation are disabled" : csv ? "CSV cells are shown as plain text" : "Images are not loaded"}</span>
            </div>
            {error && <p className="vc-file-notice" role="status">{error}</p>}
            <div id={`${id}-raw`} hidden={showPreview}>{raw}</div>
            <div id={`${id}-rich`} className="vc-file-rich" hidden={!showPreview} tabIndex={showPreview ? 0 : -1} role="region" aria-label={`Rendered file: ${fileName}`}>
                {nodes && renderNodes(nodes)}
                {rows && <CsvTable rows={rows} fileName={fileName} />}
                {htmlDocument && <iframe className="vc-file-html" title={`Sandboxed HTML: ${fileName}`} sandbox="" referrerPolicy="no-referrer" srcDoc={htmlDocument} tabIndex={showPreview ? 0 : -1} />}
            </div>
        </section>
    );
}
