import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import type { LeakageCategory } from "@vasooli/core";
import type { PlaybookArm } from "@vasooli/llm";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Playbooks live at repo root `/playbooks`, three levels up from
 * apps/engine/src (apps/engine/src -> apps/engine -> apps -> repo root). */
const PLAYBOOKS_DIR = join(__dirname, "..", "..", "..", "playbooks");

interface RawPlaybookArm {
  name: string;
  description: string;
  requires_approval: boolean;
  template?: string;
}

interface RawPlaybook {
  id: string;
  name: string;
  category: LeakageCategory;
  cost_paise: number;
  arms: RawPlaybookArm[];
}

/** A bandit-selectable arm: a playbook arm plus its globally-unique id and
 * per-touch cost (inherited from its playbook; "control" arms are free). */
export type CatalogArm = PlaybookArm & { id: string; costPaise: bigint; playbookId: string };

export interface PlaybookCatalog {
  playbooks: RawPlaybook[];
  /** All arms across all playbooks, flattened, each with a globally-unique id. */
  arms: CatalogArm[];
  /** Arms grouped by the leakage category they apply to. */
  armsByCategory: Map<LeakageCategory, CatalogArm[]>;
}

export type { RawPlaybook, RawPlaybookArm };

/**
 * Flattens already-parsed playbooks into a bandit-ready catalog.
 *
 * Kept separate from the filesystem read so callers that cannot reach the
 * repo's `/playbooks` directory at runtime — a bundled serverless build,
 * for instance — can hand over the same playbooks from wherever they got
 * them and still go through this one code path.
 */
export function buildPlaybookCatalog(playbooks: RawPlaybook[]): PlaybookCatalog {
  const arms: CatalogArm[] = [];
  const armsByCategory = new Map<LeakageCategory, CatalogArm[]>();

  for (const playbook of playbooks) {
    const costPaise = BigInt(playbook.cost_paise ?? 0);
    for (const arm of playbook.arms) {
      const catalogArm: CatalogArm = {
        id: `${playbook.id}:${arm.name}`,
        name: arm.name,
        description: arm.description,
        requiresApproval: arm.requires_approval,
        template: arm.template,
        costPaise: arm.name === "control" ? 0n : costPaise,
        playbookId: playbook.id,
      };
      arms.push(catalogArm);
      const bucket = armsByCategory.get(playbook.category) ?? [];
      bucket.push(catalogArm);
      armsByCategory.set(playbook.category, bucket);
    }
  }

  return { playbooks, arms, armsByCategory };
}

/** Loads every `*.yaml` playbook from the repo-root `/playbooks` directory.
 * Read once at startup — playbooks are static content, not something the
 * LLM writes. */
export function loadPlaybookCatalog(dir: string = PLAYBOOKS_DIR): PlaybookCatalog {
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  return buildPlaybookCatalog(files.map((f) => parse(readFileSync(join(dir, f), "utf8"))));
}
