import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const source = resolve("src/lib/sessions");
const target = resolve(
  process.argv[2] || "../syrka-campus",
  "src/lib/sessions",
);
const names = ["model.ts", "providers.ts", "server.ts", "transcripts.ts"];
const files = {};
await mkdir(target, { recursive: true });
for (const name of names) {
  const content = await readFile(resolve(source, name));
  files[name] = createHash("sha256").update(content).digest("hex");
  await writeFile(resolve(target, name), content);
}
const manifest =
  JSON.stringify(
    { protocol: 1, source: "tahirmahm/syrka-workspace", files },
    null,
    2,
  ) + "\n";
await writeFile(resolve(source, "manifest.json"), manifest);
await writeFile(resolve(target, "manifest.json"), manifest);
