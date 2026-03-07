#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const FEATURES_ROOT = path.join(ROOT, "src", "features");

const BUDGETS = [
  {
    label: "components",
    pathSegment: `${path.sep}components${path.sep}`,
    exts: new Set([".ts", ".tsx"]),
    target: 300,
    hardCap: 500,
  },
  {
    label: "server",
    pathSegment: `${path.sep}server${path.sep}`,
    exts: new Set([".ts"]),
    target: 250,
    hardCap: 400,
  },
];

const LEGACY_EXEMPT = new Set([
  "src/features/scenes/components/DraftRunner.tsx",
  "src/features/map/components/MapPageClient.tsx",
  "src/features/reviews/components/ReviewPanelClient.tsx",
  "src/features/map/server/mapService.ts",
  "src/features/muse/server/museApiService.ts",
  "src/features/ingest/server/ingestApproveSplitService.ts",
  "src/features/ingest/server/ingestSplitDraftService.ts",
  "src/features/reviews/server/reviewApiService.ts",
  "src/features/story/server/libraryRepo.ts",
  "src/features/ingest/server/ingestJobsService.ts",
  "src/features/autowrite/server/autowriteRunService.ts",
  "src/features/map/server/mapApiService.ts",
  "src/features/guard/server/storyContextBuilder.ts",
  "src/features/ingest/server/ingestAuxService.ts",
  "src/features/ingest/server/ingestReprocessService.ts",
  "src/features/story/server/storyProfileService.ts",
]);

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
      continue;
    }
    files.push(full);
  }
  return files;
}

function countLines(text) {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

function matchBudget(filePath) {
  for (const budget of BUDGETS) {
    if (!filePath.includes(budget.pathSegment)) continue;
    const ext = path.extname(filePath);
    if (!budget.exts.has(ext)) continue;
    return budget;
  }
  return null;
}

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

async function main() {
  const allFiles = await walk(FEATURES_ROOT);
  const warnRows = [];
  const failRows = [];
  const legacyRows = [];

  for (const filePath of allFiles) {
    const budget = matchBudget(filePath);
    if (!budget) continue;
    const relativePath = rel(filePath);
    const content = await fs.readFile(filePath, "utf8");
    const lines = countLines(content);
    if (LEGACY_EXEMPT.has(relativePath)) {
      legacyRows.push({ filePath, lines, budget });
      continue;
    }
    if (lines > budget.hardCap) {
      failRows.push({ filePath, lines, budget });
      continue;
    }
    if (lines > budget.target) {
      warnRows.push({ filePath, lines, budget });
    }
  }

  if (legacyRows.length > 0) {
    console.log("Legacy exemptions (not enforced yet):");
    for (const row of legacyRows.sort((a, b) => b.lines - a.lines)) {
      console.log(`- ${rel(row.filePath)}: ${row.lines} lines (target ${row.budget.target}, cap ${row.budget.hardCap})`);
    }
    console.log("");
  }

  if (warnRows.length > 0) {
    console.log("Line budget warnings (over target):");
    for (const row of warnRows.sort((a, b) => b.lines - a.lines)) {
      console.log(`- ${rel(row.filePath)}: ${row.lines} lines (target ${row.budget.target}, cap ${row.budget.hardCap})`);
    }
  } else {
    console.log("No files over target line budgets.");
  }

  if (failRows.length > 0) {
    console.error("\nLine budget hard-cap violations:");
    for (const row of failRows.sort((a, b) => b.lines - a.lines)) {
      console.error(`- ${rel(row.filePath)}: ${row.lines} lines (cap ${row.budget.hardCap})`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("check_line_budgets failed:", error);
  process.exit(1);
});
