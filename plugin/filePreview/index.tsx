/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import { React } from "@webpack/common";

import { isCsvFilename } from "./csv";
import { attachmentPreviewRange, isHtmlFilename } from "./html";
import { isMarkdownFilename } from "./markdown";
import { previewPatch } from "./patches";
import { FilePreview, PreviewProps } from "./Preview";
import { isSvgFilename } from "./svg";

export default definePlugin({
    name: "FilePreview",
    description: "Adds a safe Raw / Preview toggle to Markdown, HTML, CSV and SVG file attachments.",
    authors: [{ name: "Local plugin", id: 0n }],
    restartNeeded: true,
    patches: [previewPatch],

    previewRange: attachmentPreviewRange,

    isFilePreview(props: Partial<PreviewProps>) {
        return (isMarkdownFilename(props?.fileName) || isHtmlFilename(props?.fileName) || isCsvFilename(props?.fileName) || isSvgFilename(props?.fileName)) && typeof props.fileContents === "string";
    },

    wrapPreview(props: Partial<PreviewProps> & { url?: string; }, native: React.ReactNode, raw: React.ReactNode) {
        if (!this.isFilePreview(props)) return native;
        return (
            <ErrorBoundary fallback={() => <>{raw}</>}>
                <FilePreview key={`${props.url ?? ""}:${props.fileName}`} fileName={props.fileName!} fileContents={props.fileContents!} bytesLeft={props.bytesLeft!} url={props.url} fileSize={props.fileSize} raw={raw} />
            </ErrorBoundary>
        );
    }
});
