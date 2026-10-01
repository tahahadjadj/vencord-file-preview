# Verification

Checked 2026-10-01 against Vencord base `7f0c10cc29fd789f2f4828ae3dc947623e837920`.

- `npm test`: 29 passing unit/security/compatibility tests.
- `npm run test:browser`: passing Markdown and HTML checks, zero external requests and zero page errors. Includes hostile HTML, stripped navigation/forms/resources, opaque-origin parent isolation, sandbox/CSP defense, themes, raw preservation, 25 Markdown and 10 HTML toggle cycles, rerender/remount and keyboard checks.
- `npm audit --audit-level=high`: zero known dependency vulnerabilities at validation time.
- Fresh official Vencord checkout with locked dependencies: full `pnpm test` passed (standalone desktop build, TypeScript, repository ESLint, upstream stylelint and metadata generation). FilePreview and an unchanged existing custom plugin compiled together; unrelated source is excluded from this repository.
- Explicit FilePreview stylesheet lint passed because upstream's normal stylesheet command excludes userplugins.
- All three actual patch regexes replayed against captured inline/modal functions. Known CopyFileContents injection points remain available. Public full-bundle uniqueness was established for the unchanged three signatures during predecessor verification.
- Synthetic screenshots were inspected; they contain only generated example content and no account/chat information.

The original Markdown plugin startup was observed in Discord desktop 0.0.414. The renamed FilePreview/HTML revision was **not installed or started in Discord**. Actual desktop attachment toggle, inline/modal layout, spoiler gating, native copy/download, Electron link behavior, iframe acceptance under the client's CSP, custom-theme overrides, all active-plugin interactions and disable/restart persistence remain unverified. This repository does not claim those tests passed.

No desktop UI, console fixtures, messages, uploads, reinstall or restart were used for this revision. Tests use only a temporary local browser profile and synthetic data. The currently installed custom plugins were left unchanged.
