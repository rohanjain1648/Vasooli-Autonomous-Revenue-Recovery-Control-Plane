// Generates a TypeScript module from the repo-root /playbooks YAML so the
// web app can build its own engine catalog without reading the filesystem
// at runtime. A bundled serverless deployment has no repo checkout to read
// from, but the playbooks still have to be exactly the ones in git — so
// they are compiled in from the same single source of truth rather than
// hand-copied into a second file that could drift.
//
// Runs before `next dev` and `next build`.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const playbooksDir = join(here, "..", "..", "..", "playbooks");
const outFile = join(here, "..", "src", "server", "playbooks.generated.ts");

const files = readdirSync(playbooksDir)
  .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
  .sort();

const playbooks = files.map((f) => parse(readFileSync(join(playbooksDir, f), "utf8")));

const banner = `// GENERATED FILE — do not edit.
// Source: /playbooks/*.yaml (${files.length} files)
// Regenerate: pnpm --filter @vasooli/web run generate:playbooks

import type { RawPlaybook } from "@vasooli/engine";

export const PLAYBOOKS: RawPlaybook[] = ${JSON.stringify(playbooks, null, 2)};
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, banner, "utf8");

console.log(`[playbooks] wrote ${files.length} playbooks to src/server/playbooks.generated.ts`);
