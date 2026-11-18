import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const dist = resolve(root, "dist");

const passthroughEntries = ["CNAME", "hashimoto", "job"];

for (const entry of passthroughEntries) {
  const src = resolve(root, entry);
  const dest = resolve(dist, entry);
  if (!existsSync(src)) continue;
  cpSync(src, dest, { recursive: true });
  console.log(`Copied ${entry} -> dist/${entry}`);
}
