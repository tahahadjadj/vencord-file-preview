# File Preview for Vencord

A source userplugin that adds **Raw / Preview** buttons to Markdown (`.md`, `.markdown`), HTML (`.html`, `.htm`), CSV (`.csv`) and SVG (`.svg`) text attachments, including uppercase extensions. Raw is the default and preserves Discord's original source component. Preview shows headings, lists, tables and code in a readable view.

![Synthetic Markdown preview](docs/images/preview-dark.png)

Screenshots are from an account-free **synthetic browser harness**, not the live Discord client. [Raw](docs/images/raw-dark.png) · [Light](docs/images/preview-light.png) · [HTML](docs/images/html-preview.png) · [CSV](docs/images/csv-preview.png) · [SVG](docs/images/svg-preview.png).

## Installation

This is a custom Vencord source plugin, not an official plugin-list entry. Follow the [custom plugin guide](https://docs.vencord.dev/installing/custom-plugins/) and [local development instructions](https://docs.vencord.dev/installing/) for a Vencord checkout. Preserve all your other userplugins when rebuilding.

1. Clone this repository alongside your Vencord checkout.
2. Copy `plugin/filePreview` into the checkout's `src/userplugins/filePreview`.
3. Add `src/userplugins/filePreview/vendor/**` to the checkout's ESLint ignores; keep all vendor licenses/provenance.
4. Run the locked dependency installation, build/type/lint checks and explicit stylesheet lint (`pnpm exec stylelint src/userplugins/filePreview/style.css`). Build using `pnpm build`, or `pnpm buildStandalone` for an existing standalone installation. Back up your installation before replacing a custom build; use the official installer as directed by Vencord's guide.
5. If you previously used **MarkdownAttachmentPreview**, disable it before enabling **FilePreview**: both patch the same native text-preview boundary. Enable FilePreview under Vencord → Plugins and restart Discord.
6. Open a supported text attachment and choose **Preview** for formatting or **Raw** for the original source.

Native download, language, word-wrap and expansion controls remain in place. Known CopyFileContents injection points are preserved. Each attachment/modal has independent state; remounting resets to Raw. Enable/disable requires a restart because the plugin uses Vencord webpack patches.

## What renders

Markdown supports headings, paragraphs, emphasis, ordered/unordered lists, blockquotes, task labels, fenced/inline code, web links and GFM tables. HTML supports basic semantic text, headings, lists, tables, quotes and code. HTML's custom CSS, source attributes, links/navigation, forms and embedded content are intentionally removed. This is a safe document preview, not a full interactive webpage preview.

HTML uses fixed dark/light styling selected by Vencord's ThemeStore. Markdown uses Discord theme variables. HTML custom-theme styling and exact original webpage appearance are unsupported. Code is displayed without syntax highlighting or execution. Mermaid is unsupported.

CSV supports comma-separated records, quoted commas, doubled escaped quotes, embedded line endings, CRLF/LF/CR record endings, a leading UTF-8 BOM, empty cells and ragged records. Every record is retained as data, including the first; generated column headings and a caption make the table accessible without guessing whether the first record is a header. Missing cells are padded, multiline cells preserve their line breaks, and wide tables scroll within the preview. Cell contents, including formulas, HTML and URLs, are literal text. Malformed quoting shows an explanation and keeps Raw available. CSV uses no additional parser dependency.

SVG previews bounded static geometry, text, gradients, simple local clip clones, nonrecursive masks and color-matrix filters. Only embedded PNG/JPEG images with validated signatures and bounded intrinsic dimensions are retained; external images, SVG image payloads, animation, scripts, events, foreign HTML, navigation and arbitrary source CSS are removed. Simple tag/class/id styles become validated presentation attributes. Owned local IDs are renamed and reference targets are checked. The drawing stays in an empty opaque iframe sandbox with no scripts or external connections. Unsupported effects may change the picture.

## Untrusted content

The plugin uses Discord's native text loader and requests a bounded range of `bytes=0-262144` (256 KiB plus one detection byte) for supported attachments on `cdn.discordapp.com` and `media.discordapp.net`. Unrelated URLs keep Discord's original range. It has no remote rendering service, account/token store or native file access. Markdown HTML/scripts are literal text. Images become labels with URLs discarded. Only explicit HTTP/HTTPS Markdown links without credentials are clickable, using `noopener noreferrer` and no referrer. HTML links remain plain text.

HTML is parsed by a bundled, pure-JavaScript parse5 AST parser; no untrusted browser DOM is created during parsing. An explicit allowlist emits fixed semantic elements with escaped text and **no source attributes**. Script/style/resource/form/meta/base/SVG/MathML and other active subtrees are discarded. The result is placed in an iframe with an **empty sandbox** (no scripts, same-origin access, forms, popups, downloads or top-navigation permissions), no referrer, and a CSP that blocks scripts, connections, images, media, frames, objects, fonts, base URLs and form submissions. Only the plugin's fixed theme CSS is present. The opaque-origin sandbox prevents attachment content from accessing the parent document. See the [iframe sandbox documentation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox) and [parse5 API](https://parse5.js.org/functions/parse5.parseFragment.html).

Markdown, HTML and CSV keep the **256 KiB** input limit and 8,192 physical lines. SVG keeps that native Raw range, then loads a full source **only when Preview is clicked**, using a streamed **8 MiB** cap, exact known file size and validated HTTPS Discord attachment URL. Credentials and referrers are omitted and redirects rejected. Partial, invalid UTF-8 or unexpected-size responses fail to Raw. Cooperative scanning/rendering can be cancelled with Raw and completed results are reused. SVG retains limits of 10,000 AST nodes, depth 32, 512 IDs, 256 simple style rules, 400,000 geometry numbers, 100,000 path commands, 65,536 characters per path/points attribute, 8,192 text characters per node / 16,384 total, 3 MiB reduced AST input and 8 MiB output. Viewports are at most 4,096 pixels; geometry is finite and bounded. Only direct static primitive clones are expanded, with no recursive use graph. Mask/filter regions are at most 2 megapixels, with at most 32 effect references. Embedded rasters are limited to 64 PNG/JPEG images, 3 MiB of base64 per image, 8,192 pixels per axis, 16 megapixels per image and 80 megapixels total; animated PNGs are excluded. This decoded raster budget can require roughly 320 MiB before browser optimizations. The source is never sent to a rendering service. These are practical workload guards, not a formal runtime guarantee. Markdown additionally bounds lines to 16,384 characters, tokens/nodes to 6,000 and depth to 24; HTML bounds nodes to 6,000 and depth to 64. CSV bounds records to 1,000, columns to 100, displayed cells to 6,000 and fields to 16,384 characters.

## Verification status

Integration targets Vencord `7f0c10cc29fd789f2f4828ae3dc947623e837920`. Four grouped replacements cover the bounded native range fetch, inline preview, expanded preview and six-line clipping. The attachment-wrapper lookup avoids the separate highlighting component. Compatibility fixtures replay each replacement exactly once and preserve native Raw, expansion and CopyFileContents boundaries. Vencord applies the group together or discards it together if signatures drift.

The plugin, including earlier full-file loading and rendering repairs, is installed in the local Discord client. This release also fixes React error 137 when Markdown contains horizontal rules or hard line breaks. CSV and SVG pass parser and synthetic browser tests for inline/expanded toggles and dismissal. **SVG exact-attachment native verification is pending; the local SVG revision is prepared separately from the published CSV commit.** Files displayed only as generic downloads are not intercepted: Discord must expose its native text-preview component for the attachment.

Portable tests cover Markdown and HTML regressions, CSV parsing/bounds/literal rendering, repeated toggles, independent attachments, raw preservation, accessibility, keyboard controls, expanded views, theme changes, hostile HTML, sandbox/CSP isolation and external-request blocking. See [verification details](docs/VERIFICATION.md) for completed checks and remaining desktop limitations. All committed fixtures and screenshots are synthetic or public compatibility snapshots; no private chats or local reports are included.

## Run tests

Node 22 or newer:

```sh
npm ci
npm test
npm run test:browser
```

Browser tests require Chrome. Set `CHROME_PATH` to its executable if necessary; the harness defaults to the standard macOS Chrome path. Tests launch a temporary headless profile, serve only local files, block external requests and close browser/server afterward. Results/screenshots go to ignored `test-results/`. No Discord account is used.

`npm run build:harness` creates the local illustrative page; serve `harness/` on localhost to inspect it. Harness React dependencies are test-only; the plugin imports Vencord's React. Full integration type/lint/build checks require a Vencord source checkout. The small public fixture is a compatibility snapshot; recheck current client signatures when updating.

## License

GPL-3.0-or-later for plugin and harness, with existing Vencord notices retained. Marked 16.4.1, parse5 7.3.0 and its bundled entities dependency retain their MIT licenses under `plugin/filePreview/vendor/`. See [provenance](plugin/filePreview/vendor/PROVENANCE.md). The captured Discord test functions remain subject to their original copyright; this repository's license does not relicense them.
