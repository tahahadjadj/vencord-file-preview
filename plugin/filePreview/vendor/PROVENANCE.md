# Vendored parser

- npm package: `marked@16.4.1`
- Public upstream: https://github.com/markedjs/marked
- Tarball SHA-256: `9144f0e2a4cea7837a698aaf84291cb89a796ef2495b28cb339c90ae78c48751`
- npm tarball SHA-1: `db37c878cfa28fa57b8dd471fe92a83282911052`
- Files copied unchanged: `lib/marked.esm.js` → `marked.js`, `lib/marked.d.ts` → `marked.d.ts`, `LICENSE.md`.
- The plugin imports the lexer and types, and never calls the library's HTML renderer. Bundler tree shaking removes unused exports.

## HTML parser bundle

- `parse5@7.3.0`, MIT: https://github.com/inikulin/parse5
- `entities` bundled transitively, MIT: https://github.com/fb55/entities
- Bundled only the `parseFragment` export using esbuild for a browser ESM module. No DOMParser, browser resource loading, custom extensions or script execution are used.
- Original parser/decoder licenses retained as `PARSE5-LICENSE.txt` and `ENTITIES-LICENSE.txt`; package-lock.json records dependency integrity.
- parse5.d.ts is a minimal local declaration of the bundled API's default AST shapes.
- Bundle SHA-256: `af61ad3795ce7026f5efa41cb14bc813428ba8105f9eca5400746ef748c1fe35`

Regenerate from locked dependencies:

```js
import { build } from "esbuild";
await build({ stdin: { contents: 'export { parseFragment } from "parse5";', resolveDir: process.cwd() }, bundle: true, platform: "browser", format: "esm", outfile: "plugin/filePreview/vendor/parse5.js", minify: true, legalComments: "eof" });
```
