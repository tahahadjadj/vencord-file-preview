# Verification

Checked 2026-10-04 against Vencord base `7f0c10cc29fd789f2f4828ae3dc947623e837920`.

- `npm test`: 64 passing parser, security, limit and compatibility tests. Includes the earlier 29 tests, accumulated full-file/line/depth repairs and 14 CSV tests with 50 deterministic Unicode/quote/newline round trips.
- `npm run test:browser`: passes for Markdown, HTML and CSV, with zero external requests and zero page errors. CSV covers quoted commas, escaped quotes, BOM, embedded CRLF, empty cells, literal hostile HTML/URLs/formulas, captions/scoped headings, horizontal overflow, ten inline and ten expanded toggle cycles, exact Raw restoration, keyboard activation, Escape/button dismissal and reopen reset. Malformed, partial, empty and over-limit CSV fallbacks pass.
- Markdown horizontal rules and hard line breaks render without passing children to React void tags (error 137). The harness exercises both supported void tags.
- Earlier HTML isolation checks still pass: source scripts/styles/resources/forms/navigation stripped, opaque empty sandbox, parent DOM inaccessible, sandbox/CSP execution blocked, theme selection, ten toggles and exact Raw preservation. Markdown preserves its 25 toggle cycles, raw DOM node, rerender/remount behavior and keyboard checks.
- Full Vencord `pnpm test`: standalone build, TypeScript, repository ESLint, core stylesheet lint and metadata generation pass against final combined local code. Explicit userplugin stylesheet lint passes. Bundled vendors retain the documented vendor-only ESLint exclusion; plugin source is linted normally.
- Four grouped patch replacements replay exactly once against the public inline/modal snapshot plus a synthetic native range-loader boundary. Syntax and native Raw/CopyFileContents injection points are preserved. The old 2026-10-01 public inline/modal fixture is a compatibility snapshot, not proof of current native attachment eligibility.
- Synthetic screenshots were inspected; no account/chat/private attachment contents or local report data are committed.

The final plugin is installed locally with a fresh rollback backup, preserving unrelated plugins, settings, loader injection and immutable file flags. GitHub Actions runs unit tests and builds the synthetic harness on Node 22; actual browser execution and full Vencord checks are performed locally.

An authenticated Discord client and supported desktop controls are required for live verification of this release. CSV native text-preview eligibility, real inline/modal layout, spoiler gating, native copy/download, Electron behavior, client CSP interaction, custom themes and plugin interactions remain pending. This release does not claim an actual CSV attachment test passed. No messages, uploads, attachment edits or deletions were used. Tests use a temporary local browser profile and synthetic data.
