# Public compatibility fixture

Captured inline and modal text-preview functions from the unauthenticated public asset `https://discord.com/assets/web.91d9ed412e5a4f3b.js` on 2026-10-01. Kept only the small functions needed to replay the inline/modal/clipping patches. Original client code belongs to Discord; the repository GPL license does not relicense it. No account state, attachment text or credentials are included. CopyFileContents signatures in the replay test are from Vencord base `7f0c10cc29fd789f2f4828ae3dc947623e837920`.

A small synthetic native loader function is appended to `text-preview.js` to exercise the fourth (bounded Range header) replacement. It is not a captured whole-module snapshot. The accumulated local repair targets the attachment wrapper using `--custom-plaintext-preview-collapsed-lines`; current native attachment eligibility still requires a live client check.
