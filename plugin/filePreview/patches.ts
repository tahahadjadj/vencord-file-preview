/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Patch } from "@utils/types";

export const previewPatch: Omit<Patch, "plugin"> = {
    find: "PlaintextFilePreview",
    group: true,
    replacement: [
        // Inline text preview, including the native Markdown experiment.
        {
            match: /children:(null==(\i)\?\(0,\i\.jsx\)\(\i(?:\.\i)?,\{className:\i\.\i\}\):\i\?\(0,\i\.jsx\)\(\i,\{text:\i,notice:\i\.trim\(\)\}\):(\(0,\i\.jsx\)\(\i,\{text:\i\+\i,language:\i,wordWrap:\i\}\)))/,
            replace: "children:$self.wrapPreview(arguments[0],$1,$3)"
        },
        // Expanded modal; download, language and word-wrap controls stay native.
        {
            match: /children:(\i\?\(0,\i\.jsx\)\(\i,\{text:\i,notice:\i\}\):(\(0,\i\.jsx\)\(\i,\{text:\i\+\i,language:\i,wordWrap:\i\}\)))/,
            replace: "children:$self.wrapPreview(arguments[0],$1,$2)"
        },
        // Keep the toolbar outside the native six-line clipping area.
        {
            match: /(\[\i\.\i\]:!\i&&!\i)(?=\}\),style:\{"--custom-plaintext-preview-collapsed-lines":6\})/,
            replace: "$1&&!$self.isFilePreview(arguments[0])"
        }
    ]
};
