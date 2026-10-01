import { build } from "esbuild";
await build({ entryPoints: [new URL("./entry.tsx", import.meta.url).pathname], bundle: true, outfile: new URL("./bundle.js", import.meta.url).pathname, format: "esm", jsx: "transform", alias: { "@webpack/common": new URL("./runtime.ts", import.meta.url).pathname } });
