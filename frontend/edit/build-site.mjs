// Bundles the AI edit render site (edit/site/index.ts) into edit/build. backend/optional_extras/ai_edit/deploy_edit_site_to_s3.py uploads it.
// Run from frontend/: node edit/build-site.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, "..");
const captions = path.join(frontend, "capiyo", "captions", "src");
const outDir = path.join(here, "build");
const publicDir = path.join(here, "site-public");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });

const started = Date.now();
await bundle({
  entryPoint: path.join(here, "site", "index.ts"),
  outDir,
  publicDir,
  enableCaching: false,
  onProgress: (progress) => {
    if (progress % 25 === 0) console.log(`bundling ${progress}%`);
  },
  webpackOverride: (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...(config.resolve?.alias ?? {}),
        "@caption-styles": path.join(captions, "player.ts"),
        "@caption-basic-catalog": path.join(captions, "Basic", "catalog.ts"),
        "@caption-basic-demo": path.join(captions, "Basic", "demo.ts"),
        "@caption-basic-engine": path.join(captions, "BasicCaption", "engine.ts"),
        "@caption-editorial-engine": path.join(captions, "EditorialSelect", "engine.ts"),
        "@caption-demo": path.join(captions, "BasicCaption", "source.ts"),
        "@caption-font-loader": path.join(captions, "BasicCaption", "fonts.ts"),
        remotion: path.join(frontend, "node_modules", "remotion"),
        react: path.join(frontend, "node_modules", "react"),
        "react-dom": path.join(frontend, "node_modules", "react-dom"),
      },
    },
  }),
});
const files = fs.readdirSync(outDir, { recursive: true }).filter((name) => fs.statSync(path.join(outDir, name)).isFile());
const bytes = files.reduce((sum, name) => sum + fs.statSync(path.join(outDir, name)).size, 0);
console.log(`bundled ${files.length} files, ${(bytes / 1e6).toFixed(1)} MB in ${((Date.now() - started) / 1000).toFixed(1)}s -> ${outDir}`);
