import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
await mkdir(new URL("../public/", import.meta.url), { recursive: true });
await copyFile(
  require.resolve("pdfjs-dist/build/pdf.worker.min.mjs"),
  new URL("../public/pdf.worker.min.mjs", import.meta.url),
);
await copyFile(
  resolve(dirname(require.resolve("pagedjs")), "../dist/paged.js"),
  new URL("../public/paged.js", import.meta.url),
);
