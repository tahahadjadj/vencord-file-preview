/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, ThemeStore, useMemo, useState, useStateFromStores } from "@webpack/common";

import { isHtmlFilename, parseHtml } from "./html";
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
        return React.createElement(node.tag, props, renderNodes(node.children));
    });
}

export function FilePreview({ fileName, fileContents, bytesLeft, raw }: PreviewProps) {
    const [preview, setPreview] = useState(false);
    const id = React.useId();
    const html = isHtmlFilename(fileName);
    const light = useStateFromStores([ThemeStore], () => ThemeStore.theme === "light");
    const problem = sourceProblem(fileContents, bytesLeft);
    const result = useMemo(() => preview ? html ? parseHtml(fileContents, bytesLeft, light) : parseMarkdown(fileContents, bytesLeft) : undefined, [preview, html, fileContents, bytesLeft, light]);
    const error = problem ?? result?.error;
    const nodes = result && "nodes" in result ? result.nodes : undefined;
    const htmlDocument = result && "document" in result ? result.document : undefined;
    const showPreview = preview && (nodes != null || htmlDocument != null);

    return (
        <section className="vc-file-preview" aria-label={`File attachment: ${fileName}`}>
            <div className="vc-file-toolbar" role="group" aria-label="File view">
                <button type="button" aria-pressed={!showPreview} aria-controls={`${id}-raw`} onClick={() => setPreview(false)}>Raw</button>
                <button type="button" aria-pressed={showPreview} aria-controls={`${id}-rich`} disabled={!!problem} onClick={() => setPreview(true)}>Preview</button>
                <span className="vc-file-hint">{html ? "HTML scripts, styles, images and navigation are disabled" : "Images are not loaded"}</span>
            </div>
            {error && <p className="vc-file-notice" role="status">{error}</p>}
            <div id={`${id}-raw`} hidden={showPreview}>{raw}</div>
            <div id={`${id}-rich`} className="vc-file-rich" hidden={!showPreview} tabIndex={showPreview ? 0 : -1} role="region" aria-label={`Rendered file: ${fileName}`}>
                {nodes && renderNodes(nodes)}
                {htmlDocument && <iframe className="vc-file-html" title={`Sandboxed HTML: ${fileName}`} sandbox="" referrerPolicy="no-referrer" srcDoc={htmlDocument} tabIndex={showPreview ? 0 : -1} />}
            </div>
        </section>
    );
}
