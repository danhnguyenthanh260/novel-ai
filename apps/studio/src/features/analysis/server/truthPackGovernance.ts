/* eslint-disable max-lines */
import { createHash } from "crypto";
import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type ChapterMode = "action" | "dialogue" | "introspection" | "transition" | "reveal" | "flashback" | "mixed";
export type PovMode = "single" | "multi";
export type TimelineMode = "present" | "flashback" | "interleaved";
export type RevealSensitivity = "low" | "medium" | "high";
export type CastPressure = "tight" | "medium" | "wide";
export type ThreadPressure = "low" | "medium" | "high";
export type SegmentKind = "sequential" | "parallel" | "flashback" | "embedded";
export type DeltaSignificance = "low" | "medium" | "high" | "critical";

export type PackBudgetPolicyV1 = {
  story_id: number;
  policy_version: number;
  default_model_class: string;
  base_budget_tokens: number;
  planner_reserve_tokens: number;
  writer_reserve_tokens: number;
  priority_a_budget: number;
  priority_b_budget: number;
  priority_c_inline_budget: number;
  compression_mode: "strict" | "balanced" | "expansive";
  drop_thresholds: {
    warn_at_ratio: number;
    hard_at_ratio: number;
  };
  model_overrides: Array<{
    model_class: string;
    base_budget_tokens?: number;
    planner_reserve_tokens?: number;
    writer_reserve_tokens?: number;
    priority_a_budget?: number;
    priority_b_budget?: number;
    priority_c_inline_budget?: number;
    compression_mode?: "strict" | "balanced" | "expansive";
  }>;
};

export type PriorityOverrideRuleV1 = {
  story_id: number | null;
  rule_key: string;
  chapter_mode: ChapterMode | "any";
  cast_pressure: CastPressure | "any";
  reveal_sensitivity: RevealSensitivity | "any";
  timeline_mode: TimelineMode | "any";
  pov_mode: PovMode | "any";
  promote_to_a: string[];
  demote_to_c: string[];
};

export type PovSequenceItemV2 = {
  pov_entity_id: string;
  segment_order: number;
  timeline_sync_group: string;
  segment_kind: SegmentKind;
  segment_anchor_ref?: string | null;
  knowledge_visibility_snapshot?: Record<string, unknown>;
  voice_constraints?: Record<string, unknown>;
  relationship_bias?: string[];
  timeline_submode?: TimelineMode;
};

export type PreChapterProfileV1 = {
  chapter_mode: ChapterMode;
  pov_mode: PovMode;
  timeline_mode: TimelineMode;
  reveal_sensitivity: RevealSensitivity;
  cast_pressure: CastPressure;
  thread_pressure: ThreadPressure;
  target_word_count: number;
  dominant_signals: string[];
};

export type PostChapterProfileV1 = PreChapterProfileV1 & {
  actual_dialogue_ratio: number;
  actual_action_density: number;
  realized_pov_sequence: PovSequenceItemV2[];
  realized_reveal_events: string[];
};

export type AuthorAnnotationV1 = {
  annotation_id: number;
  story_id: number;
  chapter_id: string | null;
  target_type: string;
  target_ref: string;
  annotation_type: string;
  payload_json: Record<string, unknown>;
  priority: string;
  status: "active" | "revoked" | "expired";
  effective_from_chapter: string | null;
  effective_to_chapter: string | null;
  annotation_version: number;
  reason: string | null;
  created_at: string;
  revoked_at: string | null;
  supersedes_annotation_id: number | null;
};

function parseAnnotationStatus(raw: unknown): AuthorAnnotationV1["status"] {
  const text = cleanText(raw).toLowerCase();
  if (text === "revoked" || text === "expired") return text;
  return "active";
}

export type EntityMergeChallengeV1 = {
  challenged_entity_id: string;
  conflicting_surface_forms: string[];
  challenge_reason: string;
  confidence: number;
  affected_fact_refs: string[];
  recommended_action: string;
  severity: "low" | "medium" | "high" | "critical";
};

export type AnalysisDeltaReportItemV1 = {
  kind: string;
  significance: DeltaSignificance;
  detail: string;
  refs: string[];
};

export type AnalysisDeltaReportV1 = {
  run_id: string;
  chapter_id: string;
  source_hash: string;
  truth_pack_changed: boolean;
  entity_merges: Array<Record<string, unknown>>;
  persona_state_changes: Array<Record<string, unknown>>;
  fact_promotions: Array<Record<string, unknown>>;
  fact_demotions: Array<Record<string, unknown>>;
  claims_marked_contested: Array<Record<string, unknown>>;
  lifecycle_updates: Array<Record<string, unknown>>;
  threads_opened: string[];
  threads_closed: string[];
  threads_escalated: string[];
  visibility_changes: string[];
  compression_drops: string[];
  staleness_flags: string[];
  fallbacks_applied: string[];
  items: AnalysisDeltaReportItemV1[];
};

export type TruthContextPackV1 = {
  chapter_profile: PreChapterProfileV1;
  priority_a: Record<string, unknown>;
  priority_b: Record<string, unknown>;
  priority_c_refs: string[];
  pov_sequence: PovSequenceItemV2[];
  token_budget_stats: {
    token_budget_target: number;
    token_budget_used: number;
    priority_a_used: number;
    priority_b_used: number;
    priority_c_refs_count: number;
  };
  compression_drops: string[];
  drop_risk_level: "low" | "medium" | "high";
  staleness_flags: Array<{
    entity_id: string;
    stale: boolean;
    chapters_since_last_presence: number;
    reintroduction_hint_required: boolean;
  }>;
  thread_pressure_summary: {
    level: ThreadPressure;
    active_threads: string[];
  };
};

const DEFAULT_PACK_BUDGET_POLICY: PackBudgetPolicyV1 = {
  story_id: 0,
  policy_version: 1,
  default_model_class: "default",
  base_budget_tokens: 2200,
  planner_reserve_tokens: 1100,
  writer_reserve_tokens: 1400,
  priority_a_budget: 1100,
  priority_b_budget: 800,
  priority_c_inline_budget: 300,
  compression_mode: "balanced",
  drop_thresholds: {
    warn_at_ratio: 0.9,
    hard_at_ratio: 1,
  },
  model_overrides: [
    {
      model_class: "32k",
      base_budget_tokens: 2000,
      priority_a_budget: 1100,
      priority_b_budget: 650,
      priority_c_inline_budget: 250,
      compression_mode: "strict",
    },
    {
      model_class: "128k",
      base_budget_tokens: 3200,
      priority_a_budget: 1500,
      priority_b_budget: 1200,
      priority_c_inline_budget: 500,
      compression_mode: "expansive",
    },
  ],
};

const DEFAULT_PRIORITY_OVERRIDE_RULES: PriorityOverrideRuleV1[] = [
  {
    story_id: null,
    rule_key: "reveal_high_sensitivity",
    chapter_mode: "reveal",
    cast_pressure: "any",
    reveal_sensitivity: "high",
    timeline_mode: "any",
    pov_mode: "any",
    promote_to_a: ["knowledge_visibility", "ambiguity_constraints"],
    demote_to_c: ["style_guidance"],
  },
  {
    story_id: null,
    rule_key: "dialogue_tight_cast",
    chapter_mode: "dialogue",
    cast_pressure: "tight",
    reveal_sensitivity: "any",
    timeline_mode: "any",
    pov_mode: "any",
    promote_to_a: ["voice_constraints", "address_forms"],
    demote_to_c: ["dormant_thread_detail"],
  },
  {
    story_id: null,
    rule_key: "flashback_timeline_priority",
    chapter_mode: "flashback",
    cast_pressure: "any",
    reveal_sensitivity: "any",
    timeline_mode: "flashback",
    pov_mode: "any",
    promote_to_a: ["timeline_constraints"],
    demote_to_c: ["dormant_thread_detail"],
  },
  {
    story_id: null,
    rule_key: "transition_thread_pressure",
    chapter_mode: "transition",
    cast_pressure: "any",
    reveal_sensitivity: "any",
    timeline_mode: "any",
    pov_mode: "any",
    promote_to_a: ["thread_pressure_summary"],
    demote_to_c: ["style_guidance"],
  },
];

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item)).filter(Boolean);
}

function estimateTokenCount(value: unknown): number {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

function chapterNumber(chapterId: string | null | undefined): number | null {
  const match = String(chapterId || "").match(/(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function chapterInRange(chapterId: string, fromChapter: string | null, toChapter: string | null): boolean {
  const current = chapterNumber(chapterId);
  const from = chapterNumber(fromChapter);
  const to = chapterNumber(toChapter);
  if (current == null) return true;
  if (from != null && current < from) return false;
  if (to != null && current > to) return false;
  return true;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function inferModelClass(rawModel?: string | null): string {
  const model = cleanText(rawModel || process.env.LLM_MODEL || process.env.OPENAI_MODEL || "default").toLowerCase();
  if (!model) return "default";
  if (model.includes("128k")) return "128k";
  if (model.includes("32k")) return "32k";
  return "default";
}

function parseCompressionMode(raw: unknown): PackBudgetPolicyV1["compression_mode"] {
  const text = cleanText(raw).toLowerCase();
  if (text === "strict" || text === "expansive") return text;
  return "balanced";
}

function parsePolicyRow(storyId: number, row: Record<string, unknown>): PackBudgetPolicyV1 {
  const dropThresholds = asRecord(row.drop_thresholds);
  const modelOverrides = Array.isArray(row.model_overrides)
    ? row.model_overrides.map((item) => asRecord(item)).map((item) => ({
      model_class: cleanText(item.model_class || "default") || "default",
      base_budget_tokens: Number(item.base_budget_tokens || 0) || undefined,
      planner_reserve_tokens: Number(item.planner_reserve_tokens || 0) || undefined,
      writer_reserve_tokens: Number(item.writer_reserve_tokens || 0) || undefined,
      priority_a_budget: Number(item.priority_a_budget || 0) || undefined,
      priority_b_budget: Number(item.priority_b_budget || 0) || undefined,
      priority_c_inline_budget: Number(item.priority_c_inline_budget || 0) || undefined,
      compression_mode: parseCompressionMode(item.compression_mode),
    }))
    : [];
  return {
    story_id: storyId,
    policy_version: Number(row.policy_version || DEFAULT_PACK_BUDGET_POLICY.policy_version),
    default_model_class: cleanText(row.default_model_class || DEFAULT_PACK_BUDGET_POLICY.default_model_class) || "default",
    base_budget_tokens: Number(row.base_budget_tokens || DEFAULT_PACK_BUDGET_POLICY.base_budget_tokens),
    planner_reserve_tokens: Number(row.planner_reserve_tokens || DEFAULT_PACK_BUDGET_POLICY.planner_reserve_tokens),
    writer_reserve_tokens: Number(row.writer_reserve_tokens || DEFAULT_PACK_BUDGET_POLICY.writer_reserve_tokens),
    priority_a_budget: Number(row.priority_a_budget || DEFAULT_PACK_BUDGET_POLICY.priority_a_budget),
    priority_b_budget: Number(row.priority_b_budget || DEFAULT_PACK_BUDGET_POLICY.priority_b_budget),
    priority_c_inline_budget: Number(row.priority_c_inline_budget || DEFAULT_PACK_BUDGET_POLICY.priority_c_inline_budget),
    compression_mode: parseCompressionMode(row.compression_mode),
    drop_thresholds: {
      warn_at_ratio: Number(dropThresholds.warn_at_ratio || DEFAULT_PACK_BUDGET_POLICY.drop_thresholds.warn_at_ratio),
      hard_at_ratio: Number(dropThresholds.hard_at_ratio || DEFAULT_PACK_BUDGET_POLICY.drop_thresholds.hard_at_ratio),
    },
    model_overrides: modelOverrides,
  };
}

export async function resolvePackBudgetPolicy(
  db: Queryable,
  storyId: number,
  modelClass?: string | null
): Promise<PackBudgetPolicyV1> {
  const res = await db.query<{
    policy_version: number;
    default_model_class: string;
    base_budget_tokens: number;
    planner_reserve_tokens: number;
    writer_reserve_tokens: number;
    priority_a_budget: number;
    priority_b_budget: number;
    priority_c_inline_budget: number;
    compression_mode: string;
    drop_thresholds: unknown;
    model_overrides: unknown;
  }>(
    `SELECT
       policy_version,
       default_model_class,
       base_budget_tokens,
       planner_reserve_tokens,
       writer_reserve_tokens,
       priority_a_budget,
       priority_b_budget,
       priority_c_inline_budget,
       compression_mode,
       drop_thresholds,
       model_overrides
     FROM public.pack_budget_policy_v1
     WHERE story_id = $1
       AND is_active = true
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [storyId]
  ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));

  const base = res.rows[0]
    ? parsePolicyRow(storyId, res.rows[0] as unknown as Record<string, unknown>)
    : { ...DEFAULT_PACK_BUDGET_POLICY, story_id: storyId };
  const effectiveModelClass = inferModelClass(modelClass || base.default_model_class);
  const override = base.model_overrides.find((item) => item.model_class === effectiveModelClass);
  if (!override) return base;
  return {
    ...base,
    default_model_class: effectiveModelClass,
    base_budget_tokens: override.base_budget_tokens ?? base.base_budget_tokens,
    planner_reserve_tokens: override.planner_reserve_tokens ?? base.planner_reserve_tokens,
    writer_reserve_tokens: override.writer_reserve_tokens ?? base.writer_reserve_tokens,
    priority_a_budget: override.priority_a_budget ?? base.priority_a_budget,
    priority_b_budget: override.priority_b_budget ?? base.priority_b_budget,
    priority_c_inline_budget: override.priority_c_inline_budget ?? base.priority_c_inline_budget,
    compression_mode: override.compression_mode ?? base.compression_mode,
  };
}

export async function loadPriorityOverrideRules(
  db: Queryable,
  storyId: number
): Promise<PriorityOverrideRuleV1[]> {
  const res = await db.query<{
    story_id: number | null;
    rule_key: string;
    chapter_mode: string;
    cast_pressure: string;
    reveal_sensitivity: string;
    timeline_mode: string;
    pov_mode: string;
    promote_to_a: unknown;
    demote_to_c: unknown;
  }>(
    `SELECT
       story_id,
       rule_key,
       chapter_mode,
       cast_pressure,
       reveal_sensitivity,
       timeline_mode,
       pov_mode,
       promote_to_a,
       demote_to_c
     FROM public.priority_override_rules_v1
     WHERE is_active = true
       AND (story_id IS NULL OR story_id = $1)
     ORDER BY story_id NULLS FIRST, updated_at DESC, id DESC`,
    [storyId]
  ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));

  if ((res.rows?.length || 0) === 0) return DEFAULT_PRIORITY_OVERRIDE_RULES;
  return res.rows.map((row) => ({
    story_id: row.story_id == null ? null : Number(row.story_id),
    rule_key: cleanText(row.rule_key),
    chapter_mode: (cleanText(row.chapter_mode).toLowerCase() || "any") as PriorityOverrideRuleV1["chapter_mode"],
    cast_pressure: (cleanText(row.cast_pressure).toLowerCase() || "any") as PriorityOverrideRuleV1["cast_pressure"],
    reveal_sensitivity: (cleanText(row.reveal_sensitivity).toLowerCase() || "any") as PriorityOverrideRuleV1["reveal_sensitivity"],
    timeline_mode: (cleanText(row.timeline_mode).toLowerCase() || "any") as PriorityOverrideRuleV1["timeline_mode"],
    pov_mode: (cleanText(row.pov_mode).toLowerCase() || "any") as PriorityOverrideRuleV1["pov_mode"],
    promote_to_a: cleanList(row.promote_to_a),
    demote_to_c: cleanList(row.demote_to_c),
  }));
}

export function buildPreChapterProfileV1(args: {
  chapterId: string;
  targetWordCount: number;
  instruction?: string;
  allowedCharacters?: string[];
}): PreChapterProfileV1 {
  const text = `${args.chapterId} ${cleanText(args.instruction)}`.toLowerCase();
  const chapterMode: ChapterMode =
    /\bflashback|memory|remember|past\b/.test(text) ? "flashback"
      : /\breveal|truth|secret|identity|expose\b/.test(text) ? "reveal"
        : /\bdialogue|conversation|argument|tension|confession\b/.test(text) ? "dialogue"
          : /\bthink|reflection|introspection|grief|emotion|feeling\b/.test(text) ? "introspection"
            : /\bfight|battle|escape|chase|attack|action\b/.test(text) ? "action"
              : args.targetWordCount <= 1800 ? "transition" : "mixed";
  const povMode: PovMode = /\bmulti pov|multiple pov|two pov|dual pov\b/.test(text) ? "multi" : "single";
  const timelineMode: TimelineMode =
    chapterMode === "flashback" ? "flashback"
      : /\bintercut|parallel|meanwhile|simultaneous\b/.test(text) ? "interleaved"
        : "present";
  const revealSensitivity: RevealSensitivity =
    chapterMode === "reveal" || /\bspoiler|reveal|secret\b/.test(text) ? "high"
      : /\bmystery|hidden|unknown\b/.test(text) ? "medium"
        : "low";
  const castCount = (args.allowedCharacters || []).length;
  const castPressure: CastPressure = castCount <= 3 ? "tight" : castCount <= 6 ? "medium" : "wide";
  const threadPressure: ThreadPressure =
    /\bresolve|payoff|close thread|closure|answer\b/.test(text) ? "high"
      : /\bsetup|seed|foreshadow\b/.test(text) ? "low"
        : "medium";
  const dominantSignals = [
    chapterMode,
    povMode,
    timelineMode,
    revealSensitivity,
    castPressure,
    threadPressure,
  ];
  return {
    chapter_mode: chapterMode,
    pov_mode: povMode,
    timeline_mode: timelineMode,
    reveal_sensitivity: revealSensitivity,
    cast_pressure: castPressure,
    thread_pressure: threadPressure,
    target_word_count: args.targetWordCount,
    dominant_signals: dominantSignals,
  };
}

export function buildPostChapterProfileV1(args: {
  prose: string;
  preProfile: PreChapterProfileV1;
  povSequence?: PovSequenceItemV2[];
  revealEvents?: string[];
}): PostChapterProfileV1 {
  const prose = cleanText(args.prose);
  const dialogueChars = (prose.match(/["“”']/g) || []).length;
  const dialogueRatio = prose.length > 0 ? Math.min(1, Number((dialogueChars / Math.max(1, prose.length)).toFixed(3))) : 0;
  const actionDensity = prose.length > 0
    ? Math.min(1, Number((((prose.match(/\b(run|ran|strike|struck|fight|fought|grab|pulled|push|pushed|attack|attacked)\b/gi) || []).length) / Math.max(1, prose.split(/\s+/).length)).toFixed(3)))
    : 0;
  return {
    ...args.preProfile,
    actual_dialogue_ratio: dialogueRatio,
    actual_action_density: actionDensity,
    realized_pov_sequence: args.povSequence || [],
    realized_reveal_events: args.revealEvents || [],
  };
}

export async function loadActiveAuthorAnnotations(
  db: Queryable,
  storyId: number,
  chapterId: string
): Promise<AuthorAnnotationV1[]> {
  const res = await db.query<{
    annotation_id: number;
    story_id: number;
    chapter_id: string | null;
    target_type: string;
    target_ref: string;
    annotation_type: string;
    payload_json: unknown;
    priority: string;
    status: "active" | "revoked" | "expired";
    effective_from_chapter: string | null;
    effective_to_chapter: string | null;
    annotation_version: number;
    reason: string | null;
    created_at: string;
    revoked_at: string | null;
    supersedes_annotation_id: number | null;
  }>(
    `SELECT
       annotation_id,
       story_id,
       chapter_id,
       target_type,
       target_ref,
       annotation_type,
       payload_json,
       priority,
       status,
       effective_from_chapter,
       effective_to_chapter,
       annotation_version,
       reason,
       created_at::text,
       revoked_at::text,
       supersedes_annotation_id
     FROM public.author_annotation_v1
     WHERE story_id = $1
       AND status = 'active'
       AND (chapter_id IS NULL OR chapter_id = $2)
     ORDER BY created_at DESC, annotation_id DESC`,
    [storyId, chapterId]
  ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));

  return res.rows
    .map((row) => ({
      annotation_id: Number(row.annotation_id),
      story_id: Number(row.story_id),
      chapter_id: row.chapter_id ? String(row.chapter_id) : null,
      target_type: cleanText(row.target_type),
      target_ref: cleanText(row.target_ref),
      annotation_type: cleanText(row.annotation_type),
      payload_json: asRecord(row.payload_json),
      priority: cleanText(row.priority),
      status: parseAnnotationStatus(row.status),
      effective_from_chapter: row.effective_from_chapter ? String(row.effective_from_chapter) : null,
      effective_to_chapter: row.effective_to_chapter ? String(row.effective_to_chapter) : null,
      annotation_version: Number(row.annotation_version || 1),
      reason: row.reason ? String(row.reason) : null,
      created_at: String(row.created_at || ""),
      revoked_at: row.revoked_at ? String(row.revoked_at) : null,
      supersedes_annotation_id: row.supersedes_annotation_id == null ? null : Number(row.supersedes_annotation_id),
    }))
    .filter((row) => chapterInRange(chapterId, row.effective_from_chapter, row.effective_to_chapter));
}

export function buildEntityResolutionCacheKey(parts: {
  chapterContentHash: string;
  relevantEntitySnapshotHash: string;
  authorAnnotationHash: string;
  identityPolicyHash: string;
}): string {
  return hashJson(parts);
}

export function compileTruthContextPackV1(args: {
  chapterId: string;
  policy: PackBudgetPolicyV1;
  rules: PriorityOverrideRuleV1[];
  profile: PreChapterProfileV1;
  allowedCharacters: string[];
  canonicalSettingFacts: string[];
  canonicalObjectFacts: string[];
  timelineLines: string[];
  carryForwardHooks: string[];
  evidenceRefs: string[];
  degradedReasons: string[];
  stalenessFlags?: TruthContextPackV1["staleness_flags"];
}): TruthContextPackV1 {
  const matchingRules = args.rules.filter((rule) =>
    (rule.chapter_mode === "any" || rule.chapter_mode === args.profile.chapter_mode) &&
    (rule.cast_pressure === "any" || rule.cast_pressure === args.profile.cast_pressure) &&
    (rule.reveal_sensitivity === "any" || rule.reveal_sensitivity === args.profile.reveal_sensitivity) &&
    (rule.timeline_mode === "any" || rule.timeline_mode === args.profile.timeline_mode) &&
    (rule.pov_mode === "any" || rule.pov_mode === args.profile.pov_mode)
  );
  const promotedToA = new Set(matchingRules.flatMap((rule) => rule.promote_to_a));
  const demotedToC = new Set(matchingRules.flatMap((rule) => rule.demote_to_c));

  const priorityA: Record<string, unknown> = {
    active_cast: args.allowedCharacters.slice(0, 8),
    valid_anchor_set: args.canonicalSettingFacts.slice(0, 4),
    active_objects: args.canonicalObjectFacts.slice(0, 6),
    timeline_state: args.timelineLines.slice(0, 6),
    open_threads: args.carryForwardHooks.slice(0, 6),
    ambiguity_constraints: args.profile.reveal_sensitivity === "high" ? ["protect unrevealed information"] : [],
  };

  const priorityB: Record<string, unknown> = {
    evidence_refs: args.evidenceRefs.slice(0, 12),
    degraded_reasons: args.degradedReasons.slice(0, 8),
    knowledge_visibility: promotedToA.has("knowledge_visibility") ? undefined : {
      reveal_sensitivity: args.profile.reveal_sensitivity,
      pov_mode: args.profile.pov_mode,
    },
    voice_constraints: demotedToC.has("voice_constraints") ? undefined : {
      chapter_mode: args.profile.chapter_mode,
      thread_pressure: args.profile.thread_pressure,
    },
    thread_pressure_summary: {
      level: args.profile.thread_pressure,
      active_threads: args.carryForwardHooks.slice(0, 6),
    },
  };

  if (promotedToA.has("knowledge_visibility")) {
    priorityA.knowledge_visibility = {
      reveal_sensitivity: args.profile.reveal_sensitivity,
      pov_mode: args.profile.pov_mode,
    };
    delete priorityB.knowledge_visibility;
  }
  if (promotedToA.has("voice_constraints")) {
    priorityA.voice_constraints = priorityB.voice_constraints;
    delete priorityB.voice_constraints;
  }
  if (promotedToA.has("thread_pressure_summary")) {
    priorityA.thread_pressure_summary = priorityB.thread_pressure_summary;
  }
  if (promotedToA.has("timeline_constraints")) {
    priorityA.timeline_constraints = args.timelineLines.slice(0, 8);
  }
  if (promotedToA.has("address_forms")) {
    priorityA.address_forms = args.allowedCharacters.slice(0, 8).map((name) => ({ entity: name, allowed_aliases: [name] }));
  }

  const priorityCRefs = args.evidenceRefs.slice(12);
  const compressionDrops: string[] = [];
  const priorityAUsed = estimateTokenCount(priorityA);
  let priorityBUsed = estimateTokenCount(priorityB);
  if (priorityBUsed > args.policy.priority_b_budget) {
    if (Array.isArray(priorityB.evidence_refs)) {
      const evidence = (priorityB.evidence_refs as string[]).slice(0, 6);
      compressionDrops.push("evidence_refs_trimmed");
      priorityB.evidence_refs = evidence;
    }
    if (Array.isArray(priorityB.degraded_reasons) && priorityBUsed > args.policy.priority_b_budget) {
      priorityB.degraded_reasons = (priorityB.degraded_reasons as string[]).slice(0, 4);
      compressionDrops.push("degraded_reasons_trimmed");
    }
    priorityBUsed = estimateTokenCount(priorityB);
  }
  const tokenBudgetUsed = priorityAUsed + priorityBUsed;
  const budgetRatio = tokenBudgetUsed / Math.max(1, args.policy.priority_a_budget + args.policy.priority_b_budget);
  const dropRiskLevel = budgetRatio >= args.policy.drop_thresholds.hard_at_ratio
    ? "high"
    : budgetRatio >= args.policy.drop_thresholds.warn_at_ratio
      ? "medium"
      : "low";

  return {
    chapter_profile: args.profile,
    priority_a: priorityA,
    priority_b: priorityB,
    priority_c_refs: priorityCRefs.slice(0, Math.max(0, args.policy.priority_c_inline_budget / 20)),
    pov_sequence: [],
    token_budget_stats: {
      token_budget_target: args.policy.base_budget_tokens,
      token_budget_used: tokenBudgetUsed,
      priority_a_used: priorityAUsed,
      priority_b_used: priorityBUsed,
      priority_c_refs_count: priorityCRefs.length,
    },
    compression_drops: compressionDrops,
    drop_risk_level: dropRiskLevel,
    staleness_flags: args.stalenessFlags || [],
    thread_pressure_summary: {
      level: args.profile.thread_pressure,
      active_threads: args.carryForwardHooks.slice(0, 6),
    },
  };
}

export function buildAnalysisDeltaReportV1(args: {
  chapterId: string;
  sourceHashInput: unknown;
  fallbacksApplied?: string[];
  compressionDrops?: string[];
  items?: AnalysisDeltaReportItemV1[];
  threadsOpened?: string[];
  threadsClosed?: string[];
  threadsEscalated?: string[];
  visibilityChanges?: string[];
  stalenessFlags?: string[];
}): AnalysisDeltaReportV1 {
  return {
    run_id: createHash("sha1").update(`${args.chapterId}:${Date.now()}:${JSON.stringify(args.sourceHashInput)}`).digest("hex"),
    chapter_id: args.chapterId,
    source_hash: hashJson(args.sourceHashInput),
    truth_pack_changed: true,
    entity_merges: [],
    persona_state_changes: [],
    fact_promotions: [],
    fact_demotions: [],
    claims_marked_contested: [],
    lifecycle_updates: [],
    threads_opened: args.threadsOpened || [],
    threads_closed: args.threadsClosed || [],
    threads_escalated: args.threadsEscalated || [],
    visibility_changes: args.visibilityChanges || [],
    compression_drops: args.compressionDrops || [],
    staleness_flags: args.stalenessFlags || [],
    fallbacks_applied: args.fallbacksApplied || [],
    items: args.items || [],
  };
}

export function annotationHash(annotations: AuthorAnnotationV1[]): string {
  return hashJson(
    annotations.map((item) => ({
      id: item.annotation_id,
      type: item.annotation_type,
      target_ref: item.target_ref,
      version: item.annotation_version,
      status: item.status,
      from: item.effective_from_chapter,
      to: item.effective_to_chapter,
    }))
  );
}
