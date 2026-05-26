import { type Page } from "@playwright/test";
import { MOCK_CHAPTERS, PROTAGONIST, SETTING } from "./ai-generation";

export type RubricScore = "pass" | "warning" | "fail";

export type RubricItem = {
  id: string;
  category: string;
  criteria: string;
  score: RubricScore;
  detail?: string;
  critical: boolean;
};

export type RubricReport = {
  items: RubricItem[];
  verdict: "PASS" | "NEEDS_REVIEW" | "FAIL";
  criticalFailures: string[];
  warnings: string[];
};

export const CRITICAL_ITEMS = ["A01", "A02", "C01", "E01"] as const;

function isCriticalFailure(item: RubricItem): boolean {
  return item.score === "fail" && CRITICAL_ITEMS.includes(item.id as typeof CRITICAL_ITEMS[number]);
}

// --------------------------------------------------------------------------
// Content-level rubric (runs against mock chapter text in-memory)
// --------------------------------------------------------------------------

export function evaluateChapterContent(chapters: typeof MOCK_CHAPTERS): RubricItem[] {
  const ids = Object.keys(chapters).sort((a, b) => parseInt(a) - parseInt(b));
  const items: RubricItem[] = [];

  // A. Structure
  items.push({
    id: "A01",
    category: "Structure",
    criteria: "Exactly 5 chapters present",
    score: ids.length === 5 ? "pass" : "fail",
    detail: `Found ${ids.length} chapters`,
    critical: true,
  });

  items.push({
    id: "A02",
    category: "Structure",
    criteria: "Chapters numbered 1–5 in order",
    score: ids.every((id, idx) => parseInt(id) === idx + 1) ? "pass" : "fail",
    detail: `Chapter ids: ${ids.join(", ")}`,
    critical: true,
  });

  items.push({
    id: "A03",
    category: "Structure",
    criteria: "No chapter has empty content",
    score: Object.values(chapters).every((c) => c.prose.trim().length > 100) ? "pass" : "fail",
    critical: true,
  });

  items.push({
    id: "A04",
    category: "Structure",
    criteria: "Each chapter meets minimum word count (500 words)",
    score: Object.values(chapters).every((c) => c.wordCount >= 500) ? "pass" : "warning",
    detail: Object.entries(chapters)
      .map(([id, c]) => `ch${id}:${c.wordCount}`)
      .join(", "),
    critical: false,
  });

  // B. Continuity
  const proses = Object.values(chapters).map((c) => c.prose);

  const ch2ReferencesChapter1 = proses[1]?.includes("K-7") || proses[1]?.includes("ghost district");
  items.push({
    id: "B01",
    category: "Continuity",
    criteria: "Chapter 2 references events from Chapter 1",
    score: ch2ReferencesChapter1 ? "pass" : "warning",
    critical: false,
  });

  const ch3ReferecesCh2 = proses[2]?.includes("Fen") || proses[2]?.includes("footprints");
  items.push({
    id: "B02",
    category: "Continuity",
    criteria: "Chapter 3 continues plot thread from Chapter 2",
    score: ch3ReferecesCh2 ? "pass" : "warning",
    critical: false,
  });

  const ch4ReferencesCh3 = proses[3]?.includes("sub-level") || proses[3]?.includes("archive");
  items.push({
    id: "B03",
    category: "Continuity",
    criteria: "Chapter 4 executes the plan established in Chapter 3",
    score: ch4ReferencesCh3 ? "pass" : "warning",
    critical: false,
  });

  const ch5ReferencesCh4 = proses[4]?.includes("Harven") || proses[4]?.includes("mother");
  items.push({
    id: "B04",
    category: "Continuity",
    criteria: "Chapter 5 resolves threads from Chapter 4",
    score: ch5ReferencesCh4 ? "pass" : "warning",
    critical: false,
  });

  // C. Character consistency
  const allContainProtagonist = proses.every((p) => p.includes(PROTAGONIST));
  items.push({
    id: "C01",
    category: "Character",
    criteria: `Protagonist name "${PROTAGONIST}" appears in every chapter`,
    score: allContainProtagonist ? "pass" : "fail",
    critical: true,
  });

  const allContainSetting = proses.every((p) => p.includes(SETTING));
  items.push({
    id: "C02",
    category: "Character",
    criteria: `Setting "${SETTING}" referenced in every chapter`,
    score: allContainSetting ? "pass" : "warning",
    critical: false,
  });

  const fenAppearsFromCh2 = proses.slice(1).some((p) => p.includes("Fen"));
  items.push({
    id: "C03",
    category: "Character",
    criteria: "Secondary character Fen introduced in Ch2 and recurs",
    score: fenAppearsFromCh2 ? "pass" : "warning",
    critical: false,
  });

  // D. Plot progression
  items.push({
    id: "D01",
    category: "Plot",
    criteria: "Chapter 1 establishes premise (ghost district discovery)",
    score: proses[0]?.includes("K-7") ? "pass" : "fail",
    critical: true,
  });

  items.push({
    id: "D02",
    category: "Plot",
    criteria: "Chapter 2 develops conflict (survivors, threat introduced)",
    score: (proses[1]?.includes("erasure") || proses[1]?.includes("Orren")) ? "pass" : "warning",
    critical: false,
  });

  items.push({
    id: "D03",
    category: "Plot",
    criteria: "Chapter 3 raises stakes (protagonist hunted / forced choice)",
    score: (proses[2]?.includes("enforcement") || proses[2]?.includes("followed")) ? "pass" : "warning",
    critical: false,
  });

  items.push({
    id: "D04",
    category: "Plot",
    criteria: "Chapter 4 pushes toward climax (archive, evidence found)",
    score: (proses[3]?.includes("original") || proses[3]?.includes("archive")) ? "pass" : "warning",
    critical: false,
  });

  items.push({
    id: "D05",
    category: "Plot",
    criteria: "Chapter 5 delivers payoff or meaningful cliffhanger",
    score: (proses[4]?.includes("court") || proses[4]?.includes("file")) ? "pass" : "warning",
    critical: false,
  });

  // E. Tone and style
  const hasAiMetaComment = proses.some((p) =>
    /as an ai|i'm an ai|i cannot|as a language model/i.test(p)
  );
  items.push({
    id: "E01",
    category: "Tone",
    criteria: "No AI meta-commentary in any chapter",
    score: hasAiMetaComment ? "fail" : "pass",
    critical: true,
  });

  const hasRepetitiveSentences = proses.some((p) => {
    const sentences = p.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
    const unique = new Set(sentences);
    return unique.size < sentences.length * 0.8;
  });
  items.push({
    id: "E02",
    category: "Tone",
    criteria: "No excessive sentence repetition (>20% duplicate sentences)",
    score: hasRepetitiveSentences ? "warning" : "pass",
    critical: false,
  });

  return items;
}

export function buildRubricReport(items: RubricItem[]): RubricReport {
  const criticalFailures = items.filter(isCriticalFailure).map((i) => i.id);
  const warnings = items.filter((i) => i.score === "warning").map((i) => i.id);
  const failures = items.filter((i) => i.score === "fail").map((i) => i.id);

  const totalItems = items.length;
  const passCount = items.filter((i) => i.score === "pass").length;
  const passRate = passCount / totalItems;

  let verdict: RubricReport["verdict"];
  if (criticalFailures.length > 0 || passRate < 0.75) {
    verdict = "FAIL";
  } else if (warnings.length > 0 || passRate < 0.90) {
    verdict = "NEEDS_REVIEW";
  } else {
    verdict = "PASS";
  }

  return { items, verdict, criticalFailures, warnings: [...warnings, ...failures.filter((id) => !criticalFailures.includes(id))] };
}

// --------------------------------------------------------------------------
// UI-level rubric assertions (run against a live Playwright page)
// --------------------------------------------------------------------------

export async function assertUXRubric(page: Page): Promise<RubricItem[]> {
  const items: RubricItem[] = [];

  // F01 — Workspace loaded without crash
  const workspace = page.locator('[data-testid="write-workspace"]');
  const workspaceVisible = await workspace.isVisible().catch(() => false);
  items.push({
    id: "F01",
    category: "UX",
    criteria: "Write workspace renders without crash",
    score: workspaceVisible ? "pass" : "fail",
    critical: true,
  });

  // F02 — Chat input is enabled and interactive
  const input = page.locator('[data-testid="chat-composer-input"]');
  const inputEnabled = await input.isEnabled().catch(() => false);
  items.push({
    id: "F02",
    category: "UX",
    criteria: "Chat composer input is enabled",
    score: inputEnabled ? "pass" : "fail",
    critical: true,
  });

  // F03 — Chat context bar shows story info
  const contextBar = page.locator('[data-testid="chat-context-bar"]');
  const contextBarVisible = await contextBar.isVisible().catch(() => false);
  items.push({
    id: "F03",
    category: "UX",
    criteria: "Chat context bar is visible",
    score: contextBarVisible ? "pass" : "warning",
    critical: false,
  });

  // F04 — Timeline scrolls without making page scroll
  const timeline = page.locator('[data-testid="chat-timeline"]');
  const timelineVisible = await timeline.isVisible().catch(() => false);
  items.push({
    id: "F04",
    category: "UX",
    criteria: "Chat timeline container is present",
    score: timelineVisible ? "pass" : "warning",
    critical: false,
  });

  // F05 — "New chapter" button is accessible
  const newChapterBtn = page.locator('[data-testid="new-chapter-btn"]');
  const newChapterBtnVisible = await newChapterBtn.isVisible().catch(() => false);
  items.push({
    id: "F05",
    category: "UX",
    criteria: "New chapter button is accessible",
    score: newChapterBtnVisible ? "pass" : "warning",
    critical: false,
  });

  return items;
}

export function printRubricReport(report: RubricReport): void {
  console.log("\n=== RUBRIC REPORT ===");
  console.log(`Verdict: ${report.verdict}`);
  console.log(`Critical failures: ${report.criticalFailures.join(", ") || "none"}`);
  console.log(`Warnings: ${report.warnings.join(", ") || "none"}`);
  console.log("\nItem breakdown:");
  for (const item of report.items) {
    const icon = item.score === "pass" ? "✓" : item.score === "warning" ? "△" : "✗";
    const critical = item.critical ? "[CRITICAL]" : "";
    console.log(`  ${icon} ${item.id} [${item.category}] ${item.criteria} ${critical}`);
    if (item.detail) console.log(`     → ${item.detail}`);
  }
  console.log("=====================\n");
}

export function assertRubricVerdict(report: RubricReport, minimumVerdict: "PASS" | "NEEDS_REVIEW"): void {
  if (report.criticalFailures.length > 0) {
    throw new Error(
      `Rubric: critical failures on items [${report.criticalFailures.join(", ")}]. Verdict: ${report.verdict}`
    );
  }
  if (minimumVerdict === "PASS" && report.verdict !== "PASS") {
    throw new Error(
      `Rubric: expected PASS but got ${report.verdict}. Warnings: [${report.warnings.join(", ")}]`
    );
  }
  // NEEDS_REVIEW is acceptable as long as no critical failures
}
