/* eslint-disable max-lines */
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";
import { CANONICAL_TOKEN_SET } from "@/features/ingest/shared/taxonomyTokens";
import type { PoolClient } from "pg";

function parsePositiveInt(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error("INVALID_ID");
  return Math.floor(n);
}

function normalizeText(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== "string") return null;
  const x = raw.trim();
  if (!x) return null;
  return x.slice(0, maxLen);
}

function parsePosInt(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

type IngestFeedbackBody = {
  chapter_id?: unknown;
  strategy?: unknown;
  rating?: unknown;
  issue_code?: unknown;
  note?: unknown;
  boundary_ref?: unknown;
  created_by?: unknown;
};

type ParsedFeedbackPayload = {
  chapterId: string | null;
  strategy: string | null;
  rating: number;
  issueCode: string | null;
  note: string | null;
  boundarySceneIdxLeft: number | null;
  boundarySceneIdxRight: number | null;
  boundaryCharOffset: number | null;
  createdBy: string;
  feedbackQualityScore: number;
  structuredTags: Record<string, unknown> | null;
  tokenKey: string;
  locationRef: string | null;
  normalizedReason: string | null;
  detectionMode: "deterministic" | "heuristic";
  enforcementMode: "block" | "warn" | "observe";
  reasonCode: string | null;
  taxonomyVersion: string;
  rulePackVersion: string;
  freezeWindowId: string;
  frozenAt: string;
  versionPairValid: boolean;
  originalDetectionMode: "deterministic" | "heuristic";
  originalEnforcementMode: "block" | "warn" | "observe";
  currentDetectionMode: "deterministic" | "heuristic";
  currentEnforcementMode: "block" | "warn" | "observe";
};

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function parseTimeoutMs(raw: string | undefined, fallbackMs: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallbackMs;
  return Math.floor(value);
}

function resolveFeedbackTimeoutMs(): number {
  const secRaw = process.env.LLM_TIMEOUT_FEEDBACK_SECONDS;
  if (secRaw) {
    const sec = Number(secRaw);
    if (Number.isFinite(sec) && sec > 0) return Math.floor(sec * 1000);
  }
  return parseTimeoutMs(process.env.LLM_TIMEOUT_FEEDBACK_MS, 20000);
}

function computeFeedbackQualityScore(input: {
  issueCode: string | null;
  note: string | null;
  boundarySceneIdxLeft: number | null;
  boundarySceneIdxRight: number | null;
  boundaryCharOffset: number | null;
  strategy: string | null;
}): number {
  let score = 0.2;
  if (input.issueCode) score += 0.3;
  if (input.strategy) score += 0.1;
  const hasBoundaryRef =
    input.boundarySceneIdxLeft !== null || input.boundarySceneIdxRight !== null || input.boundaryCharOffset !== null;
  if (hasBoundaryRef) score += 0.25;
  const noteLen = (input.note ?? "").trim().length;
  if (noteLen >= 16) score += 0.1;
  if (noteLen >= 64) score += 0.05;
  return Math.round(clamp(score, 0.05, 1.0) * 1000) / 1000;
}

function resolveTaxonomyVersion(): string {
  return normalizeText(process.env.AGENT_TAXONOMY_VERSION, 32) ?? "v1.0";
}

function resolveRulePackVersion(): string {
  return normalizeText(process.env.AGENT_RULE_PACK_VERSION, 32) ?? "rp1.0";
}

function resolveFreezeWindowId(nowIso: string): string {
  return normalizeText(process.env.AGENT_FREEZE_WINDOW_ID, 64) ?? nowIso.slice(0, 10);
}

type ParsedTemplateFinding = {
  tokenKey: string;
  locationRef: string | null;
  normalizedReason: string;
  reasonCode: string | null;
  confidenceScore: number;
  source: "template_line" | "fallback_text";
};

type ParsedTemplateResult = {
  tokenKey: string;
  locationRef: string | null;
  normalizedReason: string | null;
  reasonCode: string | null;
  confidenceScore: number;
  parserMode: "deterministic" | "heuristic";
  findings: ParsedTemplateFinding[];
};

function parseReviewerTemplate(note: string | null): ParsedTemplateResult {
  if (!note || note.trim().length === 0) {
    return {
      tokenKey: "UNCLASSIFIED",
      locationRef: null,
      normalizedReason: null,
      reasonCode: "PARSER_LOW_CONFIDENCE",
      confidenceScore: 0.1,
      parserMode: "heuristic",
      findings: [],
    };
  }
  const raw = note.trim().slice(0, 2000);
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const templateFindings: ParsedTemplateFinding[] = [];
  for (const line of lines) {
    if (!line.includes("+")) continue;
    const parts = line.split("+").map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const tokenRaw = (parts[0] || "").toUpperCase().replace(/[\[\]]/g, "").trim().replace(/\s+/g, "_");
    const tokenKey = CANONICAL_TOKEN_SET.has(tokenRaw) ? tokenRaw : "UNCLASSIFIED";
    const location = parts.length >= 2 ? normalizeText(parts[1], 240) : null;
    const reason = normalizeText(parts.slice(2).join(" + "), 300) ?? normalizeText(line, 300) ?? "Unspecified issue";
    let confidence = tokenKey === "UNCLASSIFIED" ? 0.45 : 0.95;
    if (!location) confidence -= 0.3;
    if (!reason) confidence -= 0.2;
    templateFindings.push({
      tokenKey,
      locationRef: location,
      normalizedReason: reason,
      reasonCode: tokenKey === "UNCLASSIFIED" ? "TOKEN_UNMAPPED" : null,
      confidenceScore: clamp(confidence, 0.05, 1.0),
      source: "template_line",
    });
  }

  if (templateFindings.length === 0) {
    const fallbackReason = normalizeText(raw, 300) ?? "Unclassified note";
    const fallbackFinding: ParsedTemplateFinding = {
      tokenKey: "UNCLASSIFIED",
      locationRef: null,
      normalizedReason: fallbackReason,
      reasonCode: "PARSER_LOW_CONFIDENCE",
      confidenceScore: 0.25,
      source: "fallback_text",
    };
    return {
      tokenKey: "UNCLASSIFIED",
      locationRef: null,
      normalizedReason: fallbackReason,
      reasonCode: "PARSER_LOW_CONFIDENCE",
      confidenceScore: 0.25,
      parserMode: "heuristic",
      findings: [fallbackFinding],
    };
  }
  const primary = templateFindings.find((x) => x.tokenKey !== "UNCLASSIFIED") ?? templateFindings[0];
  const avgConfidence =
    templateFindings.reduce((sum, item) => sum + item.confidenceScore, 0) / Math.max(1, templateFindings.length);
  const hasAnyMapped = templateFindings.some((x) => x.tokenKey !== "UNCLASSIFIED");

  return {
    tokenKey: primary.tokenKey,
    locationRef: primary.locationRef,
    normalizedReason: primary.normalizedReason,
    reasonCode: hasAnyMapped ? null : "TOKEN_UNMAPPED",
    confidenceScore: clamp(avgConfidence, 0.05, 1.0),
    parserMode: primary.tokenKey === "UNCLASSIFIED" ? "heuristic" : "deterministic",
    findings: templateFindings,
  };
}

async function resolveVersionPairValid(client: PoolClient, taxonomyVersion: string, rulePackVersion: string): Promise<boolean> {
  try {
    const res = await client.query<{ is_enabled: boolean }>(
      `SELECT is_enabled
       FROM public.taxonomy_rule_pack_compatibility
       WHERE taxonomy_version = $1
         AND rule_pack_version = $2
       LIMIT 1`,
      [taxonomyVersion, rulePackVersion]
    );
    if (res.rowCount === 0) return false;
    return Boolean(res.rows[0]?.is_enabled);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("does not exist")) return true;
    return true;
  }
}

function parseFeedbackPayload(body: IngestFeedbackBody): ParsedFeedbackPayload {
  const ratingRaw = Number(body.rating);
  const rating = Number.isFinite(ratingRaw) && ratingRaw >= 0 ? 1 : -1;
  const chapterId = normalizeText(body.chapter_id, 120);
  const strategy = normalizeText(body.strategy, 120);
  const issueCode = normalizeText(body.issue_code, 120) || "OTHER";
  const note = normalizeText(body.note, 2000);
  const boundaryRef =
    body.boundary_ref && typeof body.boundary_ref === "object" && !Array.isArray(body.boundary_ref)
      ? (body.boundary_ref as Record<string, unknown>)
      : {};

  const nowIso = new Date().toISOString();
  const taxonomyVersion = resolveTaxonomyVersion();
  const rulePackVersion = resolveRulePackVersion();
  const parsedTemplate = parseReviewerTemplate(note);
  const parsed = {
    chapterId,
    strategy,
    rating,
    issueCode,
    note,
    boundarySceneIdxLeft: parsePosInt(boundaryRef.scene_idx_left),
    boundarySceneIdxRight: parsePosInt(boundaryRef.scene_idx_right),
    boundaryCharOffset: parsePosInt(boundaryRef.char_offset),
    createdBy: normalizeText(body.created_by, 120) ?? "ui",
    feedbackQualityScore: 0,
    structuredTags: null,
    tokenKey: parsedTemplate.tokenKey,
    locationRef: parsedTemplate.locationRef,
    normalizedReason: parsedTemplate.normalizedReason,
    detectionMode: parsedTemplate.parserMode,
    enforcementMode: parsedTemplate.tokenKey === "UNCLASSIFIED" ? ("observe" as const) : ("warn" as const),
    reasonCode: parsedTemplate.reasonCode,
    taxonomyVersion,
    rulePackVersion,
    freezeWindowId: resolveFreezeWindowId(nowIso),
    frozenAt: nowIso,
    versionPairValid: true,
    originalDetectionMode: parsedTemplate.parserMode,
    originalEnforcementMode: parsedTemplate.tokenKey === "UNCLASSIFIED" ? ("observe" as const) : ("warn" as const),
    currentDetectionMode: parsedTemplate.parserMode,
    currentEnforcementMode: parsedTemplate.tokenKey === "UNCLASSIFIED" ? ("observe" as const) : ("warn" as const),
  };
  parsed.feedbackQualityScore = Math.max(
    computeFeedbackQualityScore(parsed),
    Math.round(parsedTemplate.confidenceScore * 1000) / 1000
  );
  return parsed;
}

const CRITICAL_STALE_TOKENS = new Set<string>([
  "MID_WORD_CUT",
  "QUOTE_CONTINUITY_BREAK",
  "PARAGRAPH_MUTILATION",
  "DIALOGUE_ATTRIBUTION_SPLIT",
  "TEMPORAL_ANCHOR_MISSED",
]);

async function markChapterSnapshotsStale(client: PoolClient, storyId: number, chapterId: string, reason: string): Promise<number> {
  try {
    const rs = await client.query<{ count: string }>(
      `WITH changed AS (
         UPDATE public.narrative_scene_state nss
         SET is_stale = true,
             stale_reason = $3,
             stale_marked_at = now()
         FROM public.narrative_scene ns
         WHERE nss.story_id = $1
           AND ns.story_id = $1
           AND ns.chapter_id = $2
           AND nss.scene_id = ns.id
           AND COALESCE(nss.is_stale, false) = false
         RETURNING 1
       )
       SELECT COUNT(*)::text AS count FROM changed`,
      [storyId, chapterId, reason.slice(0, 240)]
    );
    return Number(rs.rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

async function getSplitTaskResult(
  client: PoolClient,
  storyId: number,
  jobId: number,
  chapterTaskId: number
): Promise<Record<string, unknown> | null> {
  const taskRes = await client.query<{ result_json: unknown }>(
    `SELECT result_json
     FROM public.ingest_task
     WHERE id = $1
       AND story_id = $2
       AND job_id = $3
       AND task_type = 'CHAPTER_SPLIT_LLM'
     LIMIT 1`,
    [chapterTaskId, storyId, jobId]
  );
  if (taskRes.rowCount === 0) return null;
  return taskRes.rows[0]?.result_json as Record<string, unknown> | null;
}

function resolveChapterIdFromPayload(chapterId: string | null, taskResult: Record<string, unknown> | null): string | null {
  if (chapterId) return chapterId;
  if (!taskResult || typeof taskResult.chapter_id !== "string" || !taskResult.chapter_id.trim()) return null;
  return taskResult.chapter_id.trim().slice(0, 120);
}

async function analyzeFeedbackNote(note: string | null): Promise<Record<string, unknown>> {
  const fallback = {
    token_key: null as string | null,
    reason_code: null as string | null,
    location_ref: null as string | null,
    confidence: 0,
    findings: [] as Array<{
      category: string;
      details: string;
      severity: string;
      impact_score: number;
    }>,
    summary_action: null as string | null,
    total_impact: 0,
    error: null as string | null,
    suggested_action: null as string | null,
  };

  if (!note || note.trim().length === 0) return fallback;
  const llmBase = process.env.LLM_API_BASE;
  if (!llmBase) {
    return { ...fallback, error: "LLM_NOT_CONFIGURED", suggested_action: "Contact system administrator." };
  }
  const timeoutMs = resolveFeedbackTimeoutMs();

  const prompt = `You are an Industrial-Grade Novel AI Feedback Supervisor. 
The user provided a complex feedback note (potentially in Vietnamese/English) about a text-splitting operation. 
Your task is to DECOMPOSE this note into multiple discrete technical findings.

Note Context:
- The user often uses the format [TOKEN] + [Location] + [Reason].
- There might be multiple such lines in one note.
- There might be an "[ACTION] + [REPROCESS]" instruction at the end.

Chain-of-Analysis:
1. Identify all distinct issues (e.g., overdense scenes, missed anchors, lore dump buried in dialogue).
2. For each finding, determine:
   - "category": dialogue_rule, entity_protection, context_error, pacing, maturity, or other.
   - "details": concise technical description of the issue.
   - "severity": "system_rule" (global logic error) or "local_fix" (specific to this location).
   - "impact_score": (0.0 to 1.0). 0.8+ is critical.
3. Determine a "token_key": Prefer the first major technical token identified.
4. Calculate "total_impact": A weighted average or max of finding scores.

Note text:
"""
${note}
"""

Output ONLY a valid minified JSON object.
Schema:
{
  "token_key": string | null,
  "reason_code": string | null,
  "location_ref": string | null,
  "confidence": number,
  "findings": [
    {
      "category": string,
      "details": string,
      "severity": "local_fix" | "system_rule",
      "impact_score": number
    }
  ],
  "summary_action": string,
  "total_impact": number
}
`;

  try {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort("LLM_TIMEOUT_FEEDBACK"), timeoutMs);
    const res = await fetch(`${llmBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LLM_API_KEY ?? "local"}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.LLM_MODEL ?? "qwen2.5-7b",
        stream: false,
        temperature: 0.1,
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    }).finally(() => clearTimeout(timeoutHandle));
    if (!res.ok) {
      return { ...fallback, error: `LLM_API_ERROR_${res.status}`, suggested_action: "The AI service is temporarily down. Please try again later." };
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json?.choices?.[0]?.message?.content?.trim() ?? "";

    // Attempt standard JSON extraction
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn("Feedback LLM response did not contain JSON:", content);
      return { ...fallback, error: "JSON_NOT_FOUND", suggested_action: "Try writing a more detailed note in English." };
    }

    try {
      // Basic cleanup to prevent trivial parse issues
      const cleanJson = match[0].replace(/\/\/.*$/gm, ""); // remove comments
      return JSON.parse(cleanJson);
    } catch {
      console.error("Feedback LLM JSON parse failed:", match[0]);
      return {
        ...fallback,
        error: "JSON_PARSE_FAILED",
        suggested_action: "Your note was saved, but the AI struggled to categorize it. Try using technical keywords like 'POV shift' or 'Dialogue'."
      };
    }
  } catch (e) {
    if (
      (e instanceof Error && e.name === "AbortError") ||
      (typeof e === "string" && e === "LLM_TIMEOUT_FEEDBACK")
    ) {
      return {
        ...fallback,
        error: "LLM_TIMEOUT_FEEDBACK",
        suggested_action: "Feedback analysis timed out. Your note was still saved.",
      };
    }
    console.error("Feedback LLM analysis exception:", e);
    return { ...fallback, error: "LLM_EXCEPTION", suggested_action: "Unexpected analyzer error. We are investigating." };
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

type AiFinding = {
  category: string;
  details: string;
  severity: "local_fix" | "system_rule";
  impact_score: number;
  token_key?: string;
  reason_code?: string | null;
  location_ref?: string | null;
  confidence?: number;
};

function categoryFromToken(tokenKey: string): string {
  const token = tokenKey.toUpperCase();
  if (token.includes("POV") || token.includes("DIALOGUE")) return "dialogue_rule";
  if (token.includes("ENTITY") || token.includes("NAME")) return "entity_protection";
  if (token.includes("TEMPORAL") || token.includes("CONTEXT")) return "context_error";
  if (token.includes("FRAGMENT") || token.includes("WIDE") || token.includes("PACE")) return "pacing";
  return "other";
}

function severityFromToken(tokenKey: string): "local_fix" | "system_rule" {
  const token = tokenKey.toUpperCase();
  if (token.includes("MID_WORD") || token.includes("QUOTE_CONTINUITY") || token.includes("PARAGRAPH")) return "system_rule";
  return "local_fix";
}

function toDeterministicFindings(items: ParsedTemplateFinding[]): AiFinding[] {
  return items.map((item) => ({
    category: categoryFromToken(item.tokenKey),
    details: item.normalizedReason,
    severity: severityFromToken(item.tokenKey),
    impact_score: clamp(item.confidenceScore, 0.05, 1.0),
    token_key: item.tokenKey,
    reason_code: item.reasonCode,
    location_ref: item.locationRef,
    confidence: item.confidenceScore,
  }));
}

function toLlmFindings(llm: Record<string, unknown>): AiFinding[] {
  const findingsRaw = Array.isArray(llm.findings) ? llm.findings : [];
  const out: AiFinding[] = [];
  for (const item of findingsRaw) {
    const obj = asObject(item);
    const details = normalizeText(obj.details, 500);
    if (!details) continue;
    const category = normalizeText(obj.category, 80) ?? "other";
    const severity = obj.severity === "system_rule" ? "system_rule" : "local_fix";
    const impactRaw = Number(obj.impact_score);
    const impact = Number.isFinite(impactRaw) ? clamp(impactRaw, 0.0, 1.0) : 0.35;
    out.push({
      category,
      details,
      severity,
      impact_score: impact,
      token_key: normalizeText(obj.token_key, 120) ?? undefined,
      reason_code: normalizeText(obj.reason_code, 120),
      location_ref: normalizeText(obj.location_ref, 200),
      confidence: Number.isFinite(Number(llm.confidence)) ? clamp(Number(llm.confidence), 0, 1) : impact,
    });
  }
  return out;
}

function buildAiInterpretation(parsedTemplate: ParsedTemplateResult, llmResult: Record<string, unknown>): Record<string, unknown> {
  const deterministicFindings = toDeterministicFindings(parsedTemplate.findings);
  const llmFindings = toLlmFindings(llmResult);
  const selectedFindings = llmFindings.length > 0 ? llmFindings : deterministicFindings;
  const source = llmFindings.length > 0 ? "llm_fallback" : "deterministic_template";
  const llmTotalImpact = Number(llmResult.total_impact);
  const selectedImpact = Number.isFinite(llmTotalImpact)
    ? clamp(llmTotalImpact, 0.0, 1.0)
    : selectedFindings.reduce((mx, f) => Math.max(mx, Number(f.impact_score) || 0), 0);
  const confidence = llmFindings.length > 0
    ? clamp(Number(llmResult.confidence) || selectedImpact || parsedTemplate.confidenceScore, 0.05, 1.0)
    : parsedTemplate.confidenceScore;

  return {
    source,
    parser_mode: parsedTemplate.parserMode,
    token_key: parsedTemplate.tokenKey,
    reason_code: parsedTemplate.reasonCode,
    location_ref: parsedTemplate.locationRef,
    confidence,
    findings: selectedFindings,
    summary_action: normalizeText(llmResult.summary_action, 400) ?? "Review findings and reprocess if needed.",
    total_impact: Math.round(clamp(selectedImpact, 0.0, 1.0) * 1000) / 1000,
    parser_findings_count: parsedTemplate.findings.length,
    llm_findings_count: llmFindings.length,
  };
}

function tryLlmTokenArbitration(structuredTags: Record<string, unknown> | null): {
  tokenKey: string;
  reasonCode: string | null;
  locationRef: string | null;
  confidence: number;
} | null {
  if (!structuredTags) return null;
  const root = asObject(structuredTags);
  const candidateRaw = typeof root.token_key === "string" ? root.token_key : null;
  const rootConfidence = Number(root.confidence);
  const rootReasonCode = typeof root.reason_code === "string" ? root.reason_code : null;
  const rootLocation = typeof root.location_ref === "string" ? root.location_ref : null;

  if (candidateRaw) {
    const tokenKey = candidateRaw.trim().toUpperCase();
    if (CANONICAL_TOKEN_SET.has(tokenKey) && tokenKey !== "UNCLASSIFIED" && Number.isFinite(rootConfidence) && rootConfidence >= 0.7) {
      return {
        tokenKey,
        reasonCode: rootReasonCode,
        locationRef: rootLocation,
        confidence: clamp(rootConfidence, 0, 1),
      };
    }
  }

  const findings = Array.isArray(root.findings) ? root.findings : [];
  for (const item of findings) {
    const finding = asObject(item);
    const tokenRaw = typeof finding.token_key === "string" ? finding.token_key.trim().toUpperCase() : "";
    const confidence = Number(finding.confidence ?? finding.impact_score);
    if (!tokenRaw || !CANONICAL_TOKEN_SET.has(tokenRaw) || tokenRaw === "UNCLASSIFIED") continue;
    if (!Number.isFinite(confidence) || confidence < 0.7) continue;
    return {
      tokenKey: tokenRaw,
      reasonCode: typeof finding.reason_code === "string" ? finding.reason_code : "LLM_TOKEN_OVERRIDE",
      locationRef: typeof finding.location_ref === "string" ? finding.location_ref : null,
      confidence: clamp(confidence, 0, 1),
    };
  }
  return null;
}

export async function postIngestFeedbackResponse(
  req: NextRequest,
  storySlug: string,
  rawJobId: string,
  rawChapterTaskId: string
): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const jobId = parsePositiveInt(rawJobId);
    const chapterTaskId = parsePositiveInt(rawChapterTaskId);
    const body = (await req.json().catch(() => ({}))) as IngestFeedbackBody;
    const parsed = parseFeedbackPayload(body);
    const parsedTemplate = parseReviewerTemplate(parsed.note);
    const llmAnalysis = await analyzeFeedbackNote(parsed.note);
    const aiInterpretation = buildAiInterpretation(parsedTemplate, llmAnalysis);
    parsed.structuredTags = {
      ...llmAnalysis,
      ai_interpretation: aiInterpretation,
      findings: Array.isArray(aiInterpretation.findings) ? aiInterpretation.findings : [],
      token_key: aiInterpretation.token_key ?? llmAnalysis.token_key ?? null,
      reason_code: aiInterpretation.reason_code ?? llmAnalysis.reason_code ?? null,
      location_ref: aiInterpretation.location_ref ?? llmAnalysis.location_ref ?? null,
      confidence: aiInterpretation.confidence ?? llmAnalysis.confidence ?? parsed.feedbackQualityScore,
      total_impact: aiInterpretation.total_impact ?? llmAnalysis.total_impact ?? 0,
      summary_action: aiInterpretation.summary_action ?? llmAnalysis.summary_action ?? null,
      parser: {
        mode: parsedTemplate.parserMode,
        findings: parsedTemplate.findings,
      },
    };
    if (parsed.tokenKey === "UNCLASSIFIED") {
      const llmSuggestion = tryLlmTokenArbitration(parsed.structuredTags);
      if (llmSuggestion) {
        parsed.tokenKey = llmSuggestion.tokenKey;
        parsed.reasonCode = llmSuggestion.reasonCode;
        parsed.locationRef = parsed.locationRef ?? llmSuggestion.locationRef;
        parsed.detectionMode = "heuristic";
        parsed.enforcementMode = "warn";
        parsed.feedbackQualityScore = Math.max(parsed.feedbackQualityScore, Math.round(llmSuggestion.confidence * 1000) / 1000);
      }
    }
    parsed.currentDetectionMode = parsed.detectionMode;
    parsed.currentEnforcementMode = parsed.enforcementMode;
    parsed.versionPairValid = await resolveVersionPairValid(client, parsed.taxonomyVersion, parsed.rulePackVersion);
    if (!parsed.versionPairValid) {
      parsed.reasonCode = "VERSION_MISMATCH";
      parsed.enforcementMode = "observe";
      parsed.currentEnforcementMode = "observe";
    }
    if (parsed.structuredTags?.total_impact !== undefined) {
      const imp = Number(parsed.structuredTags.total_impact);
      if (Number.isFinite(imp)) {
        parsed.feedbackQualityScore = Math.round(clamp(imp, 0.0, 1.0) * 1000) / 1000;
      }
    }

    await client.query("BEGIN");
    const taskResult = await getSplitTaskResult(client, storyId, jobId, chapterTaskId);
    if (!taskResult) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "CHAPTER_TASK_NOT_FOUND" }, { status: 404 });
    }
    const resolvedChapterId = resolveChapterIdFromPayload(parsed.chapterId, taskResult);
    if (!resolvedChapterId) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "CHAPTER_ID_REQUIRED" }, { status: 400 });
    }

    const shouldMarkStale =
      parsed.rating < 0 &&
      resolvedChapterId &&
      (CRITICAL_STALE_TOKENS.has(parsed.tokenKey) || parsed.currentEnforcementMode === "block");
    const staleMarkedCount = shouldMarkStale
      ? await markChapterSnapshotsStale(client, storyId, resolvedChapterId, `feedback:${parsed.tokenKey}:${parsed.reasonCode ?? "unspecified"}`)
      : 0;
    if (staleMarkedCount > 0 && !parsed.reasonCode) {
      parsed.reasonCode = "SNAPSHOT_STALE_MARKED";
    }

    // [DEDUPLICATION] Check if the same note exists for this task & rating
    const existing = await client.query(
      `SELECT id FROM public.split_feedback 
       WHERE chapter_task_id = $1 AND note = $2 AND rating = $3
       LIMIT 1`,
      [chapterTaskId, parsed.note, parsed.rating]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      const existingId = existing.rows[0].id;
      try {
        await client.query(
          `UPDATE public.split_feedback
           SET structured_tags = $1,
               feedback_quality_score = $2,
               taxonomy_version = $3,
               rule_pack_version = $4,
               version_pair_valid = $5,
               token_key = $6,
               location_ref = $7,
               detection_mode = $8,
               enforcement_mode = $9,
               reason_code = $10,
               freeze_window_id = $11,
               frozen_at = $12,
               original_detection_mode = COALESCE(original_detection_mode, $13),
               original_enforcement_mode = COALESCE(original_enforcement_mode, $14),
               current_detection_mode = $15,
               current_enforcement_mode = $16,
               created_at = now()
           WHERE id = $17`,
          [
            parsed.structuredTags ? JSON.stringify(parsed.structuredTags) : null,
            parsed.feedbackQualityScore,
            parsed.taxonomyVersion,
            parsed.rulePackVersion,
            parsed.versionPairValid,
            parsed.tokenKey,
            parsed.locationRef,
            parsed.detectionMode,
            parsed.enforcementMode,
            parsed.reasonCode,
            parsed.freezeWindowId,
            parsed.frozenAt,
            parsed.originalDetectionMode,
            parsed.originalEnforcementMode,
            parsed.currentDetectionMode,
            parsed.currentEnforcementMode,
            existingId,
          ]
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "";
        if (!msg.includes("original_detection_mode")) throw error;
        await client.query(
          `UPDATE public.split_feedback
           SET structured_tags = $1,
               feedback_quality_score = $2,
               taxonomy_version = $3,
               rule_pack_version = $4,
               version_pair_valid = $5,
               token_key = $6,
               location_ref = $7,
               detection_mode = $8,
               enforcement_mode = $9,
               reason_code = $10,
               freeze_window_id = $11,
               frozen_at = $12,
               created_at = now()
           WHERE id = $13`,
          [
            parsed.structuredTags ? JSON.stringify(parsed.structuredTags) : null,
            parsed.feedbackQualityScore,
            parsed.taxonomyVersion,
            parsed.rulePackVersion,
            parsed.versionPairValid,
            parsed.tokenKey,
            parsed.locationRef,
            parsed.detectionMode,
            parsed.enforcementMode,
            parsed.reasonCode,
            parsed.freezeWindowId,
            parsed.frozenAt,
            existingId,
          ]
        );
      }
    } else {
      try {
        await client.query(
          `INSERT INTO public.split_feedback
             (story_id, job_id, chapter_task_id, chapter_id, strategy, rating, issue_code, note, boundary_scene_idx_left, boundary_scene_idx_right, boundary_char_offset, created_by, feedback_quality_score, structured_tags, taxonomy_version, rule_pack_version, version_pair_valid, token_key, location_ref, detection_mode, enforcement_mode, reason_code, freeze_window_id, frozen_at, original_detection_mode, original_enforcement_mode, current_detection_mode, current_enforcement_mode)
           VALUES
             ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)`,
          [
            storyId,
            jobId,
            chapterTaskId,
            resolvedChapterId,
            parsed.strategy,
            parsed.rating,
            parsed.issueCode,
            parsed.note,
            parsed.boundarySceneIdxLeft,
            parsed.boundarySceneIdxRight,
            parsed.boundaryCharOffset,
            parsed.createdBy,
            parsed.feedbackQualityScore,
            parsed.structuredTags ? JSON.stringify(parsed.structuredTags) : null,
            parsed.taxonomyVersion,
            parsed.rulePackVersion,
            parsed.versionPairValid,
            parsed.tokenKey,
            parsed.locationRef,
            parsed.detectionMode,
            parsed.enforcementMode,
            parsed.reasonCode,
            parsed.freezeWindowId,
            parsed.frozenAt,
            parsed.originalDetectionMode,
            parsed.originalEnforcementMode,
            parsed.currentDetectionMode,
            parsed.currentEnforcementMode,
          ]
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "";
        if (!msg.includes("original_detection_mode")) throw error;
        await client.query(
          `INSERT INTO public.split_feedback
             (story_id, job_id, chapter_task_id, chapter_id, strategy, rating, issue_code, note, boundary_scene_idx_left, boundary_scene_idx_right, boundary_char_offset, created_by, feedback_quality_score, structured_tags, taxonomy_version, rule_pack_version, version_pair_valid, token_key, location_ref, detection_mode, enforcement_mode, reason_code, freeze_window_id, frozen_at)
           VALUES
             ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
          [
            storyId,
            jobId,
            chapterTaskId,
            resolvedChapterId,
            parsed.strategy,
            parsed.rating,
            parsed.issueCode,
            parsed.note,
            parsed.boundarySceneIdxLeft,
            parsed.boundarySceneIdxRight,
            parsed.boundaryCharOffset,
            parsed.createdBy,
            parsed.feedbackQualityScore,
            parsed.structuredTags ? JSON.stringify(parsed.structuredTags) : null,
            parsed.taxonomyVersion,
            parsed.rulePackVersion,
            parsed.versionPairValid,
            parsed.tokenKey,
            parsed.locationRef,
            parsed.detectionMode,
            parsed.enforcementMode,
            parsed.reasonCode,
            parsed.freezeWindowId,
            parsed.frozenAt,
          ]
        );
      }
    }
    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      story_id: storyId,
      job_id: jobId,
      chapter_task_id: chapterTaskId,
      chapter_id: resolvedChapterId,
      strategy: parsed.strategy,
      rating: parsed.rating,
      feedback_quality_score: parsed.feedbackQualityScore,
      structured_tags: parsed.structuredTags,
      ai_interpretation:
        parsed.structuredTags && typeof parsed.structuredTags === "object"
          ? (parsed.structuredTags as Record<string, unknown>).ai_interpretation ?? null
          : null,
      taxonomy_version: parsed.taxonomyVersion,
      rule_pack_version: parsed.rulePackVersion,
      version_pair_valid: parsed.versionPairValid,
      token_key: parsed.tokenKey,
      location_ref: parsed.locationRef,
      detection_mode: parsed.detectionMode,
      enforcement_mode: parsed.enforcementMode,
      original_detection_mode: parsed.originalDetectionMode,
      original_enforcement_mode: parsed.originalEnforcementMode,
      current_detection_mode: parsed.currentDetectionMode,
      current_enforcement_mode: parsed.currentEnforcementMode,
      reason_code: parsed.reasonCode,
      freeze_window_id: parsed.freezeWindowId,
      frozen_at: parsed.frozenAt,
      stale_marked_count: staleMarkedCount,
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "SPLIT_FEEDBACK_POST_FAILED";
    const status = msg.includes("INVALID_ID") || msg.includes("ISSUE_CODE_REQUIRED") ? 400 : msg.includes("STORY_ARCHIVED") ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  } finally {
    client.release();
  }
}
