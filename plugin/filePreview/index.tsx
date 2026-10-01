/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import { React } from "@webpack/common";

import { isHtmlFilename } from "./html";
import { isMarkdownFilename } from "./markdown";
import { previewPatch } from "./patches";
import { FilePreview, PreviewProps } from "./Preview";

export default definePlugin({
    name: "FilePreview",
    description: "Adds a safe Raw / Preview toggle to Markdown and HTML file attachments.",
    authors: [{ name: "Local plugin", id: 0n }],
    restartNeeded: true,
    patches: [previewPatch],

    isFilePreview(props: Partial<PreviewProps>) {
        return (isMarkdownFilename(props?.fileName) || isHtmlFilename(props?.fileName)) && typeof props.fileContents === "string";
    },

    wrapPreview(props: Partial<PreviewProps> & { url?: string; }, native: React.ReactNode, raw: React.ReactNode) {
        if (!this.isFilePreview(props)) return native;
        return (
            <ErrorBoundary fallback={() => <>{raw}</>}>
                <FilePreview key={`${props.url ?? ""}:${props.fileName}`} fileName={props.fileName!} fileContents={props.fileContents!} bytesLeft={props.bytesLeft!} raw={raw} />
            </ErrorBoundary>
        );
    }
});
