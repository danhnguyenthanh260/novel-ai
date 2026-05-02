/* eslint-disable max-lines */
import type { Pool } from "pg";
import { buildStoryContextPack } from "@/features/guard/server/storyContextBuilder";
import { callChatCompletionJson } from "@/app/api/muse/_shared";
import {
    getEntityTruthOverlayMap,
    resolveEntityTruth,
    toRoleAndTypeFromLegacyCategory,
    type EntityCandidate,
} from "@/features/memory/server/entityConflictService";
import {
    annotationHash,
    buildAnalysisDeltaReportV1,
    buildEntityResolutionCacheKey,
    buildPreChapterProfileV1,
    compileTruthContextPackV1,
    loadActiveAuthorAnnotations,
    loadPriorityOverrideRules,
    resolvePackBudgetPolicy,
    type AnalysisDeltaReportV1,
    type EntityMergeChallengeV1,
    type PackBudgetPolicyV1,
    type PreChapterProfileV1,
    type TruthContextPackV1,
} from "@/features/analysis/server/truthPackGovernance";
import { buildWritingContextFromPlanning } from "@/features/writing-context/server/writingContextAdapter";

export type ChapterPlanArgs = {
    storyId: number;
    storySlug: string;
    chapterId: string;
    targetWordCount: number;
    userPrompt?: string;
    writingIntentMode?: "CONTINUE_CANON" | "RETCON_REWRITE";
};

export type ChapterPlanResult = {
    ok: boolean;
    chapter_id: string;
    target_word_count: number;
    plan: {
        title: string;
        summary: string;
        beats: Array<{
            idx: number;
            label: string;
            description: string;
            location: string;
            characters: string[];
            estimated_words: number;
            evidence_ids?: string[];
        }>;
        context_guard: {
            location_anchor: string;
            active_plot_threads: string[];
            important_objects: string[];
        };
        chapter_output_contract_v1?: {
            word_range: { min: number; target: number; max: number };
            scene_range: { min: number; max: number };
            pacing_target: string;
            voice_target: string;
            taboo_constraints: string[];
        };
        memory_runtime_v5?: {
            layer_priority_effective: string[];
            used_counts_by_layer: Record<string, number>;
            dropped_counts_by_layer: Record<string, number>;
            overlap_dedup_ratio: number;
            degraded_reasons: string[];
            evidence_refs: {
                canon_refs: string[];
                timeline_refs: string[];
                snapshot_refs?: string[];
                arc_refs?: string[];
                saga_refs?: string[];
                core_refs?: string[];
            };
        };
        planning_guard_v1?: {
            allowed_characters: string[];
            characters_used: string[];
            unknown_character_hits: string[];
            replan_triggered: boolean;
        };
        conflict_report_v1?: {
            detected_count: number;
            unresolved_critical_count: number;
            conflicts: Array<{
                entity_key: string;
                conflict_type?: string;
                status: string;
                canonical_role: string;
                canonical_type: string;
                conflict_review_id?: number | null;
            }>;
        };
        resolution_status?: "AUTO_RESOLVED" | "REQUIRES_HUMAN_REVIEW" | "RESOLVED_BY_USER";
        blocked_by_conflict_review?: boolean;
        blocked_by_canon_conflict?: boolean;
        blocked_reason?: string | null;
        writing_intent_mode?: "CONTINUE_CANON" | "RETCON_REWRITE";
        retcon_accepted?: boolean;
        plan_continuity_gate_v1?: {
            pass: boolean;
            blocked_by_canon_conflict: boolean;
            writing_intent_mode: "CONTINUE_CANON" | "RETCON_REWRITE";
            drift_classes: string[];
            checks: Array<{
                code: "SETTING_DRIFT" | "OBJECT_DRIFT" | "CHARACTER_STATE_DRIFT" | "TIMELINE_DRIFT" | "HOOK_DROP";
                severity: "LOW" | "MEDIUM" | "HIGH";
                pass: boolean;
                detail: string;
            }>;
        };
        canonical_diff_preview?: {
            added_settings: string[];
            added_objects: string[];
            unknown_characters_in_beats: string[];
            dropped_hooks: string[];
            timeline_anchor_mismatch: string[];
        };
        character_state_cards_used?: Array<{
            entity: string;
            role: string;
            type: string;
            age_band: string;
            affiliation: string;
            current_state: string;
            evidence_ids: string[];
        }>;
        continuity_evidence_refs?: string[];
        entity_assignments?: Array<{
            entity: string;
            role: string;
            type: string;
            status: string;
            evidence_ids: string[];
        }>;
        fact_lifecycle_v1?: {
            active_facts: Array<{
                fact_key: string;
                dimension: "setting" | "object" | "character_state" | "timeline" | "hook";
                label: string;
                evidence_ref: string;
                valid_from_chapter: string | null;
                valid_to_chapter: string | null;
                lifecycle_state: "ACTIVE" | "SUPERSEDED" | "DEPRECATED" | "INVALIDATED" | "UNCERTAIN";
                supersedes_fact_key: string | null;
                change_mode: "PROGRESSION" | "REDEFINITION" | "RETCON" | "REMOVAL";
                confidence: number;
            }>;
            non_active_facts: Array<{
                fact_key: string;
                dimension: "setting" | "object" | "character_state" | "timeline" | "hook";
                label: string;
                evidence_ref: string;
                valid_from_chapter: string | null;
                valid_to_chapter: string | null;
                lifecycle_state: "ACTIVE" | "SUPERSEDED" | "DEPRECATED" | "INVALIDATED" | "UNCERTAIN";
                supersedes_fact_key: string | null;
                change_mode: "PROGRESSION" | "REDEFINITION" | "RETCON" | "REMOVAL";
                confidence: number;
            }>;
        };
        canon_delta_report_v1?: {
            classification: "VALID_PROGRESSION" | "RETCON_REQUIRED" | "LOCAL_PATCH_POSSIBLE" | "UNRESOLVED_CONFLICT";
            confidence: number;
            affected_dimensions: string[];
            recommended_action: "CONTINUE" | "REANALYZE" | "PATCH_IN_PLACE" | "RETCON_REWRITE" | "HUMAN_REVIEW";
            superseded_fact_refs: string[];
            proposed_new_facts: string[];
        };
        conflict_root_cause_v1?: {
            summary: string;
            unresolved_count: number;
            checks: Array<{
                dimension: "setting" | "object" | "character_state" | "timeline" | "hook";
                issue_code: string;
                severity: "LOW" | "MEDIUM" | "HIGH";
                evidence_refs: string[];
                candidate_new_facts: string[];
                disposition: "SUPERSEDED" | "CONTRADICTED" | "MISSING" | "CLOSED";
                confidence: number;
                recommended_action: "CONTINUE" | "REANALYZE" | "PATCH_IN_PLACE" | "RETCON_REWRITE" | "HUMAN_REVIEW";
                explanation: string;
            }>;
        };
        reanalysis_actions_v1?: {
            attempted: boolean;
            mode: "none" | "memory_refresh";
            result: "not_needed" | "accepted_after_refresh" | "still_conflicted" | "analysis_insufficient";
            refreshed_snapshot_refs: string[];
        };
        conflict_resolution_mode?: "none" | "reanalysis" | "local_patch" | "retcon" | "human_review";
        delta_classification?: "VALID_PROGRESSION" | "RETCON_REQUIRED" | "LOCAL_PATCH_POSSIBLE" | "UNRESOLVED_CONFLICT";
        superseded_fact_refs?: string[];
        new_fact_candidates?: string[];
        pack_budget_policy_v1?: PackBudgetPolicyV1;
        pre_chapter_profile_v1?: PreChapterProfileV1;
        truth_context_pack_v1?: TruthContextPackV1;
        analysis_delta_report_v1?: AnalysisDeltaReportV1;
        entity_merge_challenge_v1?: EntityMergeChallengeV1[];
        entity_resolution_cache_v1?: {
            chapter_content_hash: string;
            relevant_entity_snapshot_hash: string;
            author_annotation_hash: string;
            identity_policy_hash: string;
            cache_key: string;
        };
    };
};

type MemoryRuntimeV5 = {
    layer_priority_effective: string[];
    used_counts_by_layer: Record<string, number>;
    dropped_counts_by_layer: Record<string, number>;
    overlap_dedup_ratio: number;
    degraded_reasons: string[];
    evidence_refs: {
        canon_refs: string[];
        timeline_refs: string[];
        snapshot_refs?: string[];
        arc_refs?: string[];
        saga_refs?: string[];
        core_refs?: string[];
    };
};

type JsonRecord = Record<string, unknown>;

function asRecord(raw: unknown): JsonRecord | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as JsonRecord;
}

function cleanText(raw: unknown, fallback = ""): string {
    if (typeof raw !== "string") return fallback;
    return raw.trim();
}

function cleanList(raw: unknown, limit: number): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean)
        .slice(0, limit);
}

function normalizeToken(raw: string): string {
    return raw.replace(/\s+/g, " ").trim();
}

const NOISE_TOKENS = new Set([
    "who", "what", "when", "where", "why", "how",
    "they", "them", "their", "this", "that", "these", "those",
    "dry", "fine", "each", "energy", "biology", "interviewing", "lab", "morning", "evening",
    "chapter", "story",
    "the", "and", "but", "for", "nor", "not", "yet", "also",
    "near", "many", "most", "some", "from", "with", "into", "onto", "over", "under",
    "you", "your", "his", "her", "its", "our", "their", "my",
    "just", "like", "could", "would", "should", "still", "either", "both",
    "only", "even", "then", "than", "more", "less", "very", "much",
    "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "around", "between", "without", "within", "during", "while", "across",
    "lights", "slight", "line", "lines", "scene", "scenes", "note", "notes",
    "leaving", "stopping", "returning", "digging", "stuffed", "disappearance",
    "discovery", "investigation", "beginning", "starting", "ending",
    "notebooks", "weathered", "tracking", "device", "devices",
    "initial", "final", "first", "last", "next", "known", "new", "old",
]);

function looksLikeCharacterName(raw: string): boolean {
    const text = normalizeToken(raw);
    if (!text) return false;
    if (text.length < 2 || text.length > 36) return false;
    if (/^\d+$/.test(text)) return false;
    if (NOISE_TOKENS.has(text.toLowerCase())) return false;
    const parts = text.split(" ").filter(Boolean);
    if (parts.length > 3) return false;
    if (parts.length === 1 && parts[0].length < 3) return false;
    return parts.every((part) => /^[A-Z][a-zA-Z0-9'_-]*$/.test(part));
}

function uniqueStrings(values: string[], limit = 256): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        const key = value.toLowerCase();
        if (!value || seen.has(key)) continue;
        seen.add(key);
        out.push(value);
        if (out.length >= limit) break;
    }
    return out;
}

function buildFactKey(dimension: FactDimension, value: string): string {
    return `${dimension}:${normalizeToken(value).toLowerCase()}`;
}

function findLifecycleFacts(facts: FactLifecycleRecord[], dimension: FactDimension, values: string[]): FactLifecycleRecord[] {
    const tokens = values.map((value) => buildFactKey(dimension, value));
    return facts.filter((fact) => fact.dimension === dimension && tokens.includes(fact.fact_key));
}

function hasProgressionSignal(lines: string[]): boolean {
    const text = lines.join(" ").toLowerCase();
    return /\b(after|later|next|now|finally|resolved|closed|upgrade|upgraded|changed|transformed|evolved|revealed)\b/.test(text);
}

function hasRetconSignal(userPrompt?: string): boolean {
    const text = String(userPrompt || "").toLowerCase();
    return /\bretcon|rewrite history|rewrite past|change canon|alternate timeline|undo\b/.test(text);
}

function collectCharactersDeep(raw: unknown, hintKey = ""): string[] {
    const out: string[] = [];
    if (raw === null || raw === undefined) return out;
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (!trimmed) return out;
        if (!(hintKey.includes("character") || hintKey.includes("participant") || hintKey.includes("cast") || hintKey.includes("actor"))) {
            return out;
        }
        const parts = trimmed.split(/[,\n;/|]/g).map((x) => x.trim()).filter(Boolean);
        for (const p of parts) {
            if (looksLikeCharacterName(p)) out.push(p);
        }
        return out;
    }
    if (Array.isArray(raw)) {
        for (const item of raw) out.push(...collectCharactersDeep(item, hintKey));
        return out;
    }
    if (typeof raw === "object") {
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            const nextKey = `${hintKey}.${k}`.toLowerCase();
            out.push(...collectCharactersDeep(v, nextKey));
        }
    }
    return out;
}

type FactDimension = "setting" | "object" | "character_state" | "timeline" | "hook";
type FactLifecycleState = "ACTIVE" | "SUPERSEDED" | "DEPRECATED" | "INVALIDATED" | "UNCERTAIN";
type ChangeMode = "PROGRESSION" | "REDEFINITION" | "RETCON" | "REMOVAL";
type CanonDeltaClassification = "VALID_PROGRESSION" | "RETCON_REQUIRED" | "LOCAL_PATCH_POSSIBLE" | "UNRESOLVED_CONFLICT";
type RecoveryAction = "CONTINUE" | "REANALYZE" | "PATCH_IN_PLACE" | "RETCON_REWRITE" | "HUMAN_REVIEW";
type ConflictResolutionMode = "none" | "reanalysis" | "local_patch" | "retcon" | "human_review";

type FactLifecycleRecord = {
    fact_key: string;
    dimension: FactDimension;
    label: string;
    evidence_ref: string;
    valid_from_chapter: string | null;
    valid_to_chapter: string | null;
    lifecycle_state: FactLifecycleState;
    supersedes_fact_key: string | null;
    change_mode: ChangeMode;
    confidence: number;
};

type CanonDeltaRootCause = {
    dimension: FactDimension;
    issue_code: string;
    severity: "LOW" | "MEDIUM" | "HIGH";
    evidence_refs: string[];
    candidate_new_facts: string[];
    disposition: "SUPERSEDED" | "CONTRADICTED" | "MISSING" | "CLOSED";
    confidence: number;
    recommended_action: RecoveryAction;
    explanation: string;
};

type CanonDeltaAnalysis = {
    classification: CanonDeltaClassification;
    confidence: number;
    recommendedAction: RecoveryAction;
    conflictResolutionMode: ConflictResolutionMode;
    affectedDimensions: FactDimension[];
    supersededFactRefs: string[];
    proposedNewFacts: string[];
    rootCauses: CanonDeltaRootCause[];
    summary: string;
    unresolvedCount: number;
};

type ReanalysisActionReport = {
    attempted: boolean;
    mode: "none" | "memory_refresh";
    result: "not_needed" | "accepted_after_refresh" | "still_conflicted" | "analysis_insufficient";
    refreshed_snapshot_refs: string[];
};

type PlanningMemoryPack = {
    canonLines: string[];
    relationshipLines: string[];
    timelineLines: string[];
    worldCoreLines: string[];
    canonicalSettingFacts: string[];
    canonicalObjectFacts: string[];
    characterStateCards: Array<{
        entity: string;
        role: string;
        type: string;
        age_band: string;
        affiliation: string;
        current_state: string;
        evidence_ids: string[];
    }>;
    carryForwardHooks: string[];
    openLoops: string[];
    allowedCharacters: string[];
    characterEvidenceMap: Record<string, string[]>;
    memoryRuntimeV5: MemoryRuntimeV5;
    sourceSnapshotIds: number[];
    conflictReport: {
        detected_count: number;
        unresolved_critical_count: number;
        conflicts: Array<{
            entity_key: string;
            conflict_type?: string;
            status: string;
            canonical_role: string;
            canonical_type: string;
            conflict_review_id?: number | null;
        }>;
    };
    entityAssignments: Array<{
        entity: string;
        role: string;
        type: string;
        status: string;
        evidence_ids: string[];
    }>;
    factLifecycleFacts: Array<{
        fact_key: string;
        dimension: "setting" | "object" | "character_state" | "timeline" | "hook";
        label: string;
        evidence_ref: string;
        valid_from_chapter: string | null;
        valid_to_chapter: string | null;
        lifecycle_state: "ACTIVE" | "SUPERSEDED" | "DEPRECATED" | "INVALIDATED" | "UNCERTAIN";
        supersedes_fact_key: string | null;
        change_mode: "PROGRESSION" | "REDEFINITION" | "RETCON" | "REMOVAL";
        confidence: number;
    }>;
    packBudgetPolicyV1: PackBudgetPolicyV1;
    priorityOverrideRulesV1: string[];
    preChapterProfileV1: PreChapterProfileV1;
    activeAuthorAnnotationsV1: Array<{
        annotation_id: number;
        annotation_type: string;
        target_type: string;
        target_ref: string;
        priority: string;
    }>;
    blockedEntityNamesFromAnnotations: string[];
    truthContextPackV1: TruthContextPackV1;
    entityResolutionCacheV1: {
        chapter_content_hash: string;
        relevant_entity_snapshot_hash: string;
        author_annotation_hash: string;
        identity_policy_hash: string;
        cache_key: string;
    };
};

async function buildPlanningMemoryPackV5(pool: Pool, args: ChapterPlanArgs): Promise<PlanningMemoryPack> {
    const degradedReasons: string[] = [];
    const usedCounts: Record<string, number> = {
        recent_structured: 0,
        arc: 0,
        saga: 0,
        core_db: 0,
        legacy_fallback: 0,
    };
    const droppedCounts: Record<string, number> = {
        recent_structured: 0,
        arc: 0,
        saga: 0,
        core_db: 0,
        legacy_fallback: 0,
    };
    const evidenceMap = new Map<string, Set<string>>();
    const candidateMap = new Map<string, EntityCandidate[]>();
    const sourceSnapshotIds: number[] = [];
    const openLoopLines: string[] = [];
    const packBudgetPolicyV1 = await resolvePackBudgetPolicy(pool, args.storyId);
    const priorityOverrideRules = await loadPriorityOverrideRules(pool, args.storyId);
    const activeAuthorAnnotations = await loadActiveAuthorAnnotations(pool, args.storyId, args.chapterId);
    const blockedEntityNamesFromAnnotations = activeAuthorAnnotations
        .filter((annotation) => annotation.annotation_type === "do_not_use_entity_here" && annotation.target_type === "entity")
        .map((annotation) => annotation.target_ref.toLowerCase());
    const blockedEntityNames = new Set(blockedEntityNamesFromAnnotations);

    const addEvidence = (character: string, evidenceId: string) => {
        const key = character.toLowerCase();
        if (!evidenceMap.has(key)) evidenceMap.set(key, new Set<string>());
        evidenceMap.get(key)!.add(evidenceId);
    };
    const addCandidate = (entityName: string, candidate: EntityCandidate) => {
        const key = entityName.toLowerCase();
        if (blockedEntityNames.has(key)) return;
        if (!candidateMap.has(key)) candidateMap.set(key, []);
        candidateMap.get(key)!.push(candidate);
    };

    const chaptersRes = await pool.query<{ chapter_id: string; arc_id: number | null }>(
        `SELECT chapter_id, arc_id
         FROM public.story_chapter
         WHERE story_id = $1
         ORDER BY id ASC`,
        [args.storyId]
    );
    const chapterIds = chaptersRes.rows.map((r) => String(r.chapter_id || "").trim()).filter(Boolean);
    const targetIdx = Math.max(0, chapterIds.indexOf(args.chapterId));
    const startIdx = Math.max(0, targetIdx - 2);
    const localChapterIds = chapterIds.slice(startIdx, targetIdx + 1);
    const targetArcId = chaptersRes.rows[targetIdx]?.arc_id ?? null;

    const recentSnapshotsRes = localChapterIds.length > 0
        ? await pool.query<{
            id: number;
            chapter_id: string;
            fact_status: string | null;
            emotional_target: string | null;
            open_loops: unknown;
            snapshot_json: unknown;
        }>(
            `SELECT DISTINCT ON (chapter_id)
               id, chapter_id, fact_status, emotional_target, open_loops, snapshot_json
             FROM public.writing_snapshot_v3
             WHERE story_id = $1
               AND approval_status = 'APPROVED'
               AND ready_for_writing = true
               AND chapter_id = ANY($2::text[])
             ORDER BY chapter_id, created_at DESC, id DESC`,
            [args.storyId, localChapterIds]
        )
        : {
            rows: [] as Array<{
                id: number;
                chapter_id: string;
                fact_status: string | null;
                emotional_target: string | null;
                open_loops: unknown;
                snapshot_json: unknown;
            }>
        };
    const recentByChapter = new Map(recentSnapshotsRes.rows.map((row) => [row.chapter_id, row]));
    const orderedRecent = localChapterIds.map((id) => recentByChapter.get(id)).filter(Boolean) as typeof recentSnapshotsRes.rows;
    usedCounts.recent_structured = orderedRecent.length;
    droppedCounts.recent_structured = Math.max(0, localChapterIds.length - orderedRecent.length);
    for (const row of orderedRecent) sourceSnapshotIds.push(row.id);

    const recentLines = orderedRecent.map((row) => {
        const loopCount = Array.isArray(row.open_loops) ? row.open_loops.length : 0;
        const emotion = row.emotional_target ? ` | emotion:${String(row.emotional_target).slice(0, 40)}` : "";
        return `- [snap:${row.id}|${row.chapter_id}] fact:${row.fact_status || "UNKNOWN"}${emotion} | loops:${loopCount}`;
    });
    for (const row of orderedRecent) {
        if (!Array.isArray(row.open_loops)) continue;
        for (const loop of row.open_loops) {
            if (!loop || typeof loop !== "object" || Array.isArray(loop)) continue;
            const rec = loop as Record<string, unknown>;
            const desc = cleanText(rec.description || rec.content || rec.label);
            if (!desc) continue;
            openLoopLines.push(`[snap:${row.id}] ${desc}`);
        }
    }

    const recentCharacters: string[] = [];
    for (const row of orderedRecent) {
        const chars = uniqueStrings(collectCharactersDeep(row.snapshot_json), 24);
        for (const c of chars) {
            if (blockedEntityNames.has(c.toLowerCase())) continue;
            recentCharacters.push(c);
            addEvidence(c, `snap:${row.id}`);
            addCandidate(c, {
                source: "saga",
                source_table: "writing_scope_snapshot_v1",
                source_id: row.id,
                type: "PERSON",
                role: "ACTOR",
                confidence: 0.65,
                evidence_ref: `snap:${row.id}`,
            });
        }
    }

    const arcScopeKey = targetArcId ? `arc:${targetArcId}` : "";
    const arcRes = arcScopeKey
        ? await pool.query<{ id: number; snapshot_json: unknown }>(
            `SELECT id, snapshot_json
             FROM public.writing_scope_snapshot_v1
             WHERE story_id = $1
               AND scope_type = 'arc'
               AND scope_key = $2
               AND approval_status = 'APPROVED'
             ORDER BY created_at DESC, id DESC
             LIMIT 1`,
            [args.storyId, arcScopeKey]
        )
        : { rows: [] as Array<{ id: number; snapshot_json: unknown }> };
    usedCounts.arc = arcRes.rows.length;
    const arcRefId = arcRes.rows[0]?.id;
    const arcLines = arcRefId ? [`- [arc:${arcRefId}|${arcScopeKey}] approved arc memory active`] : [];
    const arcCharacters = arcRefId ? uniqueStrings(collectCharactersDeep(arcRes.rows[0].snapshot_json), 24) : [];
    for (const c of arcCharacters) {
        addEvidence(c, `arc:${arcRefId}`);
        addCandidate(c, {
            source: "arc",
            source_table: "writing_scope_snapshot_v1",
            source_id: arcRefId,
            type: "PERSON",
            role: "ACTOR",
            confidence: 0.85,
            evidence_ref: `arc:${arcRefId}`,
        });
    }

    const sagaRes = await pool.query<{ id: number; snapshot_json: unknown }>(
        `SELECT id, snapshot_json
         FROM public.writing_scope_snapshot_v1
         WHERE story_id = $1
           AND scope_type = 'story'
           AND scope_key = 'story:all'
           AND approval_status = 'APPROVED'
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [args.storyId]
    ).catch(() => ({ rows: [] as Array<{ id: number; snapshot_json: unknown }> }));
    usedCounts.saga = sagaRes.rows.length;
    const sagaRefId = sagaRes.rows[0]?.id;
    const sagaLines = sagaRefId ? [`- [saga:${sagaRefId}|story:all] approved saga memory active`] : [];
    const sagaCharacters = sagaRefId ? uniqueStrings(collectCharactersDeep(sagaRes.rows[0].snapshot_json), 24) : [];
    for (const c of sagaCharacters) {
        addEvidence(c, `saga:${sagaRefId}`);
        addCandidate(c, {
            source: "saga",
            source_table: "writing_scope_snapshot_v1",
            source_id: sagaRefId,
            type: "PERSON",
            role: "ACTOR",
            confidence: 0.9,
            evidence_ref: `saga:${sagaRefId}`,
        });
    }

    const coreRes = await pool.query<{
        id: number;
        subject: string;
        predicate: string;
        object: string;
    }>(
        `SELECT f.id, f.subject, f.predicate, f.object
         FROM public.canon_fact f
         JOIN public.narrative_scene s ON s.id = f.scene_id
         WHERE f.story_id = $1
           AND s.is_verified = true
         ORDER BY f.created_at DESC, f.id DESC
         LIMIT 24`,
        [args.storyId]
    ).catch(() => ({ rows: [] as Array<{ id: number; subject: string; predicate: string; object: string }> }));
    const coreLines = coreRes.rows.map((r) => `- [core:${r.id}] (${r.predicate}) ${r.subject} -> ${r.object}`);
    usedCounts.core_db = coreLines.length;
    for (const row of coreRes.rows) {
        const charCandidates = uniqueStrings([
            ...collectCharactersDeep(row.subject, "subject"),
            ...collectCharactersDeep(row.object, "object"),
        ], 4);
        for (const c of charCandidates) addEvidence(c, `core:${row.id}`);
    }

    const legacyRes = await pool.query<{ id: number; category: string; content: string }>(
        `SELECT id, category, content
         FROM public.story_canon_fact
         WHERE story_id = $1
         ORDER BY importance DESC, id DESC
         LIMIT 120`,
        [args.storyId]
    ).catch(() => ({ rows: [] as Array<{ id: number; category: string; content: string }> }));
    const CHARACTER_CATEGORIES = new Set(["character", "person", "persona", "actor", "protagonist", "antagonist", "npc", "ally", "enemy", "cast"]);
    for (const row of legacyRes.rows) {
        const cat = String(row.category || "").toLowerCase();
        const isCharacterCategory = CHARACTER_CATEGORIES.has(cat) || cat.includes("character") || cat.includes("person");
        if (!isCharacterCategory) continue;
        const rawContent = normalizeToken(String(row.content || ""));
        if (!rawContent) continue;
        if (rawContent.length > 60) continue;
        const name = rawContent;
        if (!looksLikeCharacterName(name)) continue;
        if (blockedEntityNames.has(name.toLowerCase())) continue;
        const mapped = toRoleAndTypeFromLegacyCategory(String(row.category || ""));
        addEvidence(name, `legacy:${row.id}`);
        addCandidate(name, {
            source: "legacy",
            source_table: "story_canon_fact",
            source_id: row.id,
            type: mapped.type,
            role: mapped.role,
            confidence: 0.4,
            evidence_ref: `legacy:${row.id}`,
        });
    }
    usedCounts.legacy_fallback = candidateMap.size;

    const fallbackContext = await buildStoryContextPack(pool, {
        storyId: args.storyId,
        chapterId: args.chapterId,
        keywords: args.userPrompt || `Chapter ${args.chapterId}`,
    });
    if (usedCounts.recent_structured === 0) degradedReasons.push("MISSING_RECENT_STRUCTURED");
    if (fallbackContext.canonLines.length > 0) degradedReasons.push("LEGACY_CONTEXT_FALLBACK_APPLIED");

    const relationshipLines = uniqueStrings([
        ...fallbackContext.relationshipLines.slice(0, 10),
        ...recentLines.slice(0, 6),
    ], 16);
    const timelineLines = uniqueStrings([
        ...fallbackContext.timelineLines.slice(0, 8),
        ...recentLines.slice(0, 4),
    ], 12);
    const worldCoreLines = uniqueStrings([
        ...fallbackContext.worldCoreLines.slice(0, 8),
        ...arcLines,
        ...sagaLines,
    ], 12);
    const canonLines = uniqueStrings([
        ...recentLines,
        ...arcLines,
        ...sagaLines,
        ...coreLines.slice(0, 12),
    ], 24);
    const canonicalSettingFacts = uniqueStrings(
        [
            ...timelineLines.filter((line) => /\b(at|in|near|inside|outside|location|setting|campus|school|lab|library)\b/i.test(line)),
            ...canonLines.filter((line) => /\b(at|in|near|inside|outside|location|setting|campus|school|lab|library)\b/i.test(line)),
        ],
        16
    );
    const canonicalObjectFacts = uniqueStrings(
        [
            ...coreLines.filter((line) => /\b(device|object|artifact|map|sensor|signal|notebook|key|tool|weapon)\b/i.test(line)),
            ...worldCoreLines.filter((line) => /\b(device|object|artifact|map|sensor|signal|notebook|key|tool|weapon)\b/i.test(line)),
        ],
        16
    );

    const overlayMap = await getEntityTruthOverlayMap(args.storyId);
    const resolvedEntities = [];
    for (const [key, candidates] of candidateMap.entries()) {
        if (blockedEntityNames.has(key)) continue;
        const pretty = uniqueStrings(candidates.map((c) => c.evidence_ref || "").filter(Boolean), 1)[0];
        const displayName = pretty ? String(pretty).startsWith("snap:") ? key.replace(/\b\w/g, (m) => m.toUpperCase()) : key.replace(/\b\w/g, (m) => m.toUpperCase()) : key.replace(/\b\w/g, (m) => m.toUpperCase());
        const resolved = await resolveEntityTruth({
            storyId: args.storyId,
            chapterId: args.chapterId,
            entityName: displayName,
            candidates,
            overlay: overlayMap,
            forceHumanOnCritical: true,
        });
        resolvedEntities.push(resolved);
    }
    const allChars = uniqueStrings(
        resolvedEntities
            .filter((row) => row.canonical_role === "ACTOR")
            .map((row) => row.entity_key.replace(/\b\w/g, (m) => m.toUpperCase())),
        80
    );
    if (allChars.length === 0) {
        degradedReasons.push("NO_ALLOWED_CHARACTERS_FROM_MEMORY");
    }
    if (blockedEntityNamesFromAnnotations.length > 0) {
        degradedReasons.push("AUTHOR_ANNOTATION_ENTITY_BLOCK");
    }

    const characterEvidenceMap: Record<string, string[]> = {};
    for (const name of allChars) {
        const refs = Array.from(evidenceMap.get(name.toLowerCase()) || []);
        characterEvidenceMap[name] = refs.slice(0, 6);
    }
    const unresolvedCritical = resolvedEntities.filter((row) => row.status === "REQUIRES_HUMAN_REVIEW");
    if (unresolvedCritical.length > 0) {
        degradedReasons.push("BLOCKED_BY_CONFLICT_REVIEW");
    }

    const characterStateCards = resolvedEntities
        .filter((row) => row.canonical_role === "ACTOR")
        .map((row) => ({
            entity: row.entity_key.replace(/\b\w/g, (m) => m.toUpperCase()),
            role: row.canonical_role,
            type: row.canonical_type,
            age_band: "unknown",
            affiliation: "unknown",
            current_state: "active",
            evidence_ids: Array.from(evidenceMap.get(row.entity_key) || []).slice(0, 6),
        }));
    const carryForwardHooks = uniqueStrings(
        [
            ...openLoopLines.slice(0, 10),
            ...relationshipLines.slice(0, 4),
            ...timelineLines.slice(0, 4),
        ],
        16
    );

    const memoryRuntimeV5: MemoryRuntimeV5 = {
        layer_priority_effective: ["recent_structured", "arc", "saga", "core_db"],
        used_counts_by_layer: usedCounts,
        dropped_counts_by_layer: droppedCounts,
        overlap_dedup_ratio: 0,
        degraded_reasons: uniqueStrings(degradedReasons, 12),
        evidence_refs: {
            canon_refs: canonLines.slice(0, 8),
            timeline_refs: timelineLines.slice(0, 6),
            snapshot_refs: sourceSnapshotIds.map((id) => `snap:${id}`),
            arc_refs: arcRefId ? [`arc:${arcRefId}`] : [],
            saga_refs: sagaRefId ? [`saga:${sagaRefId}`] : [],
            core_refs: coreLines.slice(0, 6).map((line) => line.match(/\[core:\d+\]/)?.[0]?.replace("[", "").replace("]", "") || "").filter(Boolean),
        },
    };

    const currentBaselineChapter = localChapterIds[localChapterIds.length - 1] || null;
    const previousBaselineChapter = localChapterIds.length > 1 ? localChapterIds[localChapterIds.length - 2] : null;
    const factLifecycleFacts: FactLifecycleRecord[] = [];
    const pushFact = (
        dimension: FactDimension,
        values: string[],
        evidenceRefs: string[],
        lifecycleState: FactLifecycleState,
        validFromChapter: string | null,
        validToChapter: string | null,
        changeMode: ChangeMode,
        supersedesFactKey: string | null,
        confidence: number
    ) => {
        values.forEach((value, idx) => {
            const label = normalizeToken(value);
            if (!label) return;
            factLifecycleFacts.push({
                fact_key: buildFactKey(dimension, label),
                dimension,
                label,
                evidence_ref: evidenceRefs[idx] || evidenceRefs[0] || "memory:derived",
                valid_from_chapter: validFromChapter,
                valid_to_chapter: validToChapter,
                lifecycle_state: lifecycleState,
                supersedes_fact_key: supersedesFactKey,
                change_mode: changeMode,
                confidence,
            });
        });
    };
    const snapshotRefs = sourceSnapshotIds.map((id) => `snap:${id}`);
    pushFact("setting", canonicalSettingFacts, snapshotRefs, "ACTIVE", currentBaselineChapter, null, "PROGRESSION", null, 0.82);
    pushFact("object", canonicalObjectFacts, snapshotRefs, "ACTIVE", currentBaselineChapter, null, "PROGRESSION", null, 0.8);
    pushFact("timeline", timelineLines, snapshotRefs, "ACTIVE", currentBaselineChapter, null, "PROGRESSION", null, 0.84);
    pushFact("hook", carryForwardHooks, snapshotRefs, "ACTIVE", currentBaselineChapter, null, "PROGRESSION", null, 0.76);
    pushFact(
        "character_state",
        characterStateCards.map((card) => `${card.entity}:${card.current_state}`),
        characterStateCards.flatMap((card) => card.evidence_ids.slice(0, 1)),
        "ACTIVE",
        currentBaselineChapter,
        null,
        "PROGRESSION",
        null,
        0.88
    );
    if (previousBaselineChapter) {
        pushFact("timeline", recentLines.slice(0, Math.max(0, recentLines.length - 1)), snapshotRefs, "SUPERSEDED", previousBaselineChapter, currentBaselineChapter, "PROGRESSION", null, 0.7);
        pushFact("hook", openLoopLines.slice(0, 6), snapshotRefs, "UNCERTAIN", previousBaselineChapter, null, "REMOVAL", null, 0.58);
    }
    const preChapterProfileV1 = buildPreChapterProfileV1({
        chapterId: args.chapterId,
        targetWordCount: args.targetWordCount,
        instruction: args.userPrompt,
        allowedCharacters: allChars,
    });
    const truthContextPackV1 = compileTruthContextPackV1({
        chapterId: args.chapterId,
        policy: packBudgetPolicyV1,
        rules: priorityOverrideRules,
        profile: preChapterProfileV1,
        allowedCharacters: allChars,
        canonicalSettingFacts,
        canonicalObjectFacts,
        timelineLines,
        carryForwardHooks,
        evidenceRefs: uniqueStrings(
            [
                ...sourceSnapshotIds.map((id) => `snap:${id}`),
                ...(arcRefId ? [`arc:${arcRefId}`] : []),
                ...(sagaRefId ? [`saga:${sagaRefId}`] : []),
                ...coreLines.slice(0, 8).map((line) => line.match(/\[core:\d+\]/)?.[0]?.replace("[", "").replace("]", "") || "").filter(Boolean),
            ],
            32
        ),
        degradedReasons: uniqueStrings(degradedReasons, 12),
    });
    const chapterContentHash = buildAnalysisDeltaReportV1({
        chapterId: args.chapterId,
        sourceHashInput: {
            chapter_id: args.chapterId,
            target_word_count: args.targetWordCount,
            user_prompt: args.userPrompt || "",
        },
    }).source_hash;
    const entityResolutionCacheV1 = {
        chapter_content_hash: chapterContentHash,
        relevant_entity_snapshot_hash: buildAnalysisDeltaReportV1({
            chapterId: args.chapterId,
            sourceHashInput: {
                sourceSnapshotIds,
                entities: resolvedEntities.map((row) => ({
                    entity_key: row.entity_key,
                    status: row.status,
                    role: row.canonical_role,
                    type: row.canonical_type,
                })),
            },
        }).source_hash,
        author_annotation_hash: annotationHash(activeAuthorAnnotations),
        identity_policy_hash: buildAnalysisDeltaReportV1({
            chapterId: args.chapterId,
            sourceHashInput: {
                policy_version: packBudgetPolicyV1.policy_version,
                model_class: packBudgetPolicyV1.default_model_class,
                rule_keys: priorityOverrideRules.map((rule) => rule.rule_key),
            },
        }).source_hash,
        cache_key: "",
    };
    entityResolutionCacheV1.cache_key = buildEntityResolutionCacheKey({
        chapterContentHash: entityResolutionCacheV1.chapter_content_hash,
        relevantEntitySnapshotHash: entityResolutionCacheV1.relevant_entity_snapshot_hash,
        authorAnnotationHash: entityResolutionCacheV1.author_annotation_hash,
        identityPolicyHash: entityResolutionCacheV1.identity_policy_hash,
    });

    return {
        canonLines,
        relationshipLines,
        timelineLines,
        worldCoreLines,
        canonicalSettingFacts,
        canonicalObjectFacts,
        characterStateCards,
        carryForwardHooks,
        openLoops: uniqueStrings(openLoopLines, 20),
        allowedCharacters: allChars,
        characterEvidenceMap,
        memoryRuntimeV5,
        sourceSnapshotIds,
        conflictReport: {
            detected_count: resolvedEntities.length,
            unresolved_critical_count: unresolvedCritical.length,
            conflicts: resolvedEntities.map((row) => ({
                entity_key: row.entity_key,
                conflict_type: row.conflict_type,
                status: row.status,
                canonical_role: row.canonical_role,
                canonical_type: row.canonical_type,
                conflict_review_id: row.conflict_review_id ?? null,
            })),
        },
        entityAssignments: resolvedEntities.map((row) => ({
            entity: row.entity_key,
            role: row.canonical_role,
            type: row.canonical_type,
            status: row.status,
            evidence_ids: Array.from(evidenceMap.get(row.entity_key) || []).slice(0, 6),
        })),
        factLifecycleFacts,
        packBudgetPolicyV1,
        priorityOverrideRulesV1: priorityOverrideRules.map((rule) => rule.rule_key),
        preChapterProfileV1,
        activeAuthorAnnotationsV1: activeAuthorAnnotations.map((annotation) => ({
            annotation_id: annotation.annotation_id,
            annotation_type: annotation.annotation_type,
            target_type: annotation.target_type,
            target_ref: annotation.target_ref,
            priority: annotation.priority,
        })),
        blockedEntityNamesFromAnnotations,
        truthContextPackV1,
        entityResolutionCacheV1,
    };
}

function parseJsonLoose(content: string): JsonRecord {
    const trimmed = content.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() || trimmed;
    try {
        const parsed = JSON.parse(candidate);
        const obj = asRecord(parsed);
        if (!obj) throw new Error("PLAN_SCHEMA_INVALID:ROOT_NOT_OBJECT");
        return obj;
    } catch {
        throw new Error("PLAN_SCHEMA_INVALID:JSON_PARSE_FAILED");
    }
}

function redistributeWords(targetWordCount: number, inputWeights: number[]): number[] {
    const fallbackWeight = inputWeights.length > 0 ? inputWeights : [1];
    const safeWeights = fallbackWeight.map((w) => (Number.isFinite(w) && w > 0 ? w : 1));
    const sum = safeWeights.reduce((acc, cur) => acc + cur, 0) || safeWeights.length;
    const base = safeWeights.map((w) => Math.max(80, Math.floor((targetWordCount * w) / sum)));
    const current = base.reduce((acc, cur) => acc + cur, 0);
    const delta = targetWordCount - current;
    if (delta !== 0) base[base.length - 1] = Math.max(80, base[base.length - 1] + delta);
    return base;
}

function normalizePlan(raw: JsonRecord, chapterId: string, targetWordCount: number): ChapterPlanResult["plan"] {
    const title = cleanText(raw.title, `Chapter ${chapterId} Plan`);
    const summary = cleanText(raw.summary);
    if (!summary) throw new Error("PLAN_SCHEMA_INVALID:MISSING_SUMMARY");

    const beatsRaw = Array.isArray(raw.beats) ? raw.beats : [];
    if (beatsRaw.length < 2) throw new Error("PLAN_SCHEMA_INVALID:BEATS_TOO_SHORT");
    if (beatsRaw.length > 8) throw new Error("PLAN_SCHEMA_INVALID:BEATS_TOO_LONG");

    const beatWeights: number[] = [];
    const beats = beatsRaw.map((beatItem, idx) => {
        const beat = asRecord(beatItem);
        if (!beat) throw new Error(`PLAN_SCHEMA_INVALID:BEAT_${idx + 1}_NOT_OBJECT`);

        const label = cleanText(beat.label);
        const description = cleanText(beat.description);
        const location = cleanText(beat.location);
        const characters = cleanList(beat.characters, 6);
        const estimatedRaw = Number(beat.estimated_words || 0);

        if (!label || !description || !location) {
            throw new Error(`PLAN_SCHEMA_INVALID:BEAT_${idx + 1}_MISSING_FIELDS`);
        }
        if (characters.length === 0) {
            throw new Error(`PLAN_SCHEMA_INVALID:BEAT_${idx + 1}_MISSING_CHARACTERS`);
        }

        beatWeights.push(Number.isFinite(estimatedRaw) && estimatedRaw > 0 ? estimatedRaw : 1);

        return {
            idx: idx + 1,
            label,
            description,
            location,
            characters,
            estimated_words: 0,
        };
    });

    const redistributed = redistributeWords(targetWordCount, beatWeights);
    const normalizedBeats = beats.map((beat, idx) => ({
        ...beat,
        estimated_words: redistributed[idx],
    }));

    const guardRaw = asRecord(raw.context_guard);
    const contextGuard = {
        location_anchor: cleanText(guardRaw?.location_anchor, normalizedBeats[0]?.location || "UNKNOWN"),
        active_plot_threads: cleanList(guardRaw?.active_plot_threads, 8),
        important_objects: cleanList(guardRaw?.important_objects, 8),
    };

    return {
        title,
        summary,
        beats: normalizedBeats,
        context_guard: contextGuard,
    };
}

function validatePlanCharacters(
    plan: ChapterPlanResult["plan"],
    allowedCharacters: string[]
): { used: string[]; unknown: string[] } {
    const allowed = new Set(allowedCharacters.map((x) => x.toLowerCase()));
    const used = uniqueStrings(plan.beats.flatMap((beat) => beat.characters), 80);
    const unknown = used.filter((name) => !allowed.has(name.toLowerCase()));
    return { used, unknown };
}

type ContinuityCheck = {
    code: "SETTING_DRIFT" | "OBJECT_DRIFT" | "CHARACTER_STATE_DRIFT" | "TIMELINE_DRIFT" | "HOOK_DROP";
    severity: "LOW" | "MEDIUM" | "HIGH";
    pass: boolean;
    detail: string;
};

function normalizedTokenSet(lines: string[]): Set<string> {
    const out = new Set<string>();
    for (const line of lines) {
        const normalized = String(line || "").toLowerCase();
        const chunks = normalized.split(/[^a-z0-9_]+/g).map((x) => x.trim()).filter((x) => x.length >= 2);
        for (const token of chunks) out.add(token);
        for (let i = 0; i < chunks.length - 1; i++) {
            if (chunks[i] && chunks[i + 1]) out.add(`${chunks[i]}_${chunks[i + 1]}`);
        }
    }
    return out;
}

function intersectionCount(values: string[], tokens: Set<string>): number {
    let count = 0;
    for (const raw of values) {
        const words = String(raw || "").toLowerCase().split(/[^a-z0-9_]+/g).filter((x) => x.length >= 2);
        const bigramMatch = words.slice(0, -1).some((w, i) => tokens.has(`${w}_${words[i + 1]}`));
        if (bigramMatch || words.some((w) => w.length >= 3 && tokens.has(w))) count += 1;
    }
    return count;
}

function evaluateContinuityGate(args: {
    plan: ChapterPlanResult["plan"];
    pack: PlanningMemoryPack;
    writingIntentMode: "CONTINUE_CANON" | "RETCON_REWRITE";
}): {
    gate: {
        pass: boolean;
        blocked_by_canon_conflict: boolean;
        writing_intent_mode: "CONTINUE_CANON" | "RETCON_REWRITE";
        drift_classes: string[];
        checks: ContinuityCheck[];
    };
    diff: NonNullable<ChapterPlanResult["plan"]["canonical_diff_preview"]>;
    blockedByCanon: boolean;
} {
    const beatLocations = uniqueStrings(args.plan.beats.map((beat) => cleanText(beat.location)).filter(Boolean), 32);
    const beatObjects = uniqueStrings(args.plan.context_guard.important_objects || [], 32);
    const usedCharacters = uniqueStrings(args.plan.beats.flatMap((beat) => beat.characters), 48);
    const plannedHooks = uniqueStrings(args.plan.context_guard.active_plot_threads || [], 24);

    const settingTokens = normalizedTokenSet(args.pack.canonicalSettingFacts);
    const objectTokens = normalizedTokenSet(args.pack.canonicalObjectFacts);
    const hookTokens = normalizedTokenSet(args.pack.carryForwardHooks);
    const timelineTokens = normalizedTokenSet(args.pack.timelineLines);
    const knownActors = new Set(args.pack.characterStateCards.map((x) => x.entity.toLowerCase()));

    const unmatchedSettings = beatLocations.filter((loc) => intersectionCount([loc], settingTokens) === 0);
    const unmatchedObjects = beatObjects.filter((obj) => intersectionCount([obj], objectTokens) === 0);
    const unknownCharacters = usedCharacters.filter((name) => !knownActors.has(name.toLowerCase()));
    const droppedHooks = plannedHooks.filter((hook) => intersectionCount([hook], hookTokens) === 0);
    const timelineMismatch = args.plan.beats
        .map((beat) => `${beat.label}: ${beat.description}`)
        .filter((line) => intersectionCount([line], timelineTokens) === 0)
        .slice(0, 3);

    const settingMemorySparse = args.pack.canonicalSettingFacts.length < 2;
    const objectMemorySparse = args.pack.canonicalObjectFacts.length < 2;
    const timelineMemorySparse = args.pack.timelineLines.length < 3;

    const effectiveSettingDriftSeverity: ContinuityCheck["severity"] =
        settingMemorySparse ? "LOW" : unmatchedSettings.length > 1 ? "HIGH" : unmatchedSettings.length > 0 ? "MEDIUM" : "LOW";
    const effectiveObjectDriftSeverity: ContinuityCheck["severity"] =
        objectMemorySparse ? "LOW" : unmatchedObjects.length > 2 ? "HIGH" : unmatchedObjects.length > 0 ? "MEDIUM" : "LOW";
    const effectiveTimelineDriftSeverity: ContinuityCheck["severity"] =
        timelineMemorySparse ? "LOW" : timelineMismatch.length > 1 ? "HIGH" : timelineMismatch.length > 0 ? "MEDIUM" : "LOW";

    const checks: ContinuityCheck[] = [
        {
            code: "SETTING_DRIFT",
            severity: effectiveSettingDriftSeverity,
            pass: unmatchedSettings.length === 0 || settingMemorySparse,
            detail: settingMemorySparse
                ? `memory sparse (${args.pack.canonicalSettingFacts.length} facts): skipping strict setting check`
                : unmatchedSettings.length === 0 ? "beat locations align with canonical setting facts" : `unmatched locations: ${unmatchedSettings.join(", ")}`,
        },
        {
            code: "OBJECT_DRIFT",
            severity: effectiveObjectDriftSeverity,
            pass: unmatchedObjects.length <= 2 || objectMemorySparse,
            detail: objectMemorySparse
                ? `memory sparse (${args.pack.canonicalObjectFacts.length} facts): skipping strict object check`
                : unmatchedObjects.length === 0 ? "important objects align with canon/world core" : `unmatched objects: ${unmatchedObjects.join(", ")}`,
        },
        {
            code: "CHARACTER_STATE_DRIFT",
            severity: unknownCharacters.length > 0 ? "HIGH" : "LOW",
            pass: unknownCharacters.length === 0,
            detail: unknownCharacters.length === 0 ? "beat cast aligns with character state cards" : `unknown actor-state bindings: ${unknownCharacters.join(", ")}`,
        },
        {
            code: "TIMELINE_DRIFT",
            severity: effectiveTimelineDriftSeverity,
            pass: timelineMismatch.length === 0 || timelineMemorySparse,
            detail: timelineMemorySparse
                ? `timeline memory sparse (${args.pack.timelineLines.length} lines): skipping strict timeline check`
                : timelineMismatch.length === 0 ? "timeline anchors are consistent" : `beats lacking timeline evidence: ${timelineMismatch.join(" | ")}`,
        },
        {
            code: "HOOK_DROP",
            severity: droppedHooks.length > 0 ? "MEDIUM" : "LOW",
            pass: droppedHooks.length === 0,
            detail: droppedHooks.length === 0 ? "carry-forward hooks preserved" : `hooks not grounded in approved memory: ${droppedHooks.join(", ")}`,
        },
    ];

    const driftClasses = checks.filter((x) => !x.pass).map((x) => x.code);
    const hasHighSeverity = checks.some((x) => !x.pass && x.severity === "HIGH");
    const blockedByCanon = args.writingIntentMode === "CONTINUE_CANON" && hasHighSeverity;

    return {
        gate: {
            pass: driftClasses.length === 0 || !blockedByCanon,
            blocked_by_canon_conflict: blockedByCanon,
            writing_intent_mode: args.writingIntentMode,
            drift_classes: driftClasses,
            checks,
        },
        diff: {
            added_settings: unmatchedSettings,
            added_objects: unmatchedObjects,
            unknown_characters_in_beats: unknownCharacters,
            dropped_hooks: droppedHooks,
            timeline_anchor_mismatch: timelineMismatch,
        },
        blockedByCanon,
    };
}

function analyzeCanonDelta(args: {
    plan: ChapterPlanResult["plan"];
    pack: PlanningMemoryPack;
    continuity: ReturnType<typeof evaluateContinuityGate>;
    writingIntentMode: "CONTINUE_CANON" | "RETCON_REWRITE";
    userPrompt?: string;
    analysisInsufficient: boolean;
}): CanonDeltaAnalysis {
    const causes: CanonDeltaRootCause[] = [];
    const diff = args.continuity.diff;
    const pushCause = (
        dimension: FactDimension,
        issueCode: string,
        severity: "LOW" | "MEDIUM" | "HIGH",
        evidenceRefs: string[],
        candidateNewFacts: string[],
        disposition: "SUPERSEDED" | "CONTRADICTED" | "MISSING" | "CLOSED",
        confidence: number,
        recommendedAction: RecoveryAction,
        explanation: string
    ) => {
        causes.push({
            dimension,
            issue_code: issueCode,
            severity,
            evidence_refs: uniqueStrings(evidenceRefs, 8),
            candidate_new_facts: uniqueStrings(candidateNewFacts, 8),
            disposition,
            confidence,
            recommended_action: recommendedAction,
            explanation,
        });
    };

    if (diff.added_settings.length > 0) {
        pushCause(
            "setting",
            "SETTING_DRIFT",
            diff.added_settings.length > 1 ? "HIGH" : "MEDIUM",
            findLifecycleFacts(args.pack.factLifecycleFacts, "setting", args.pack.canonicalSettingFacts).map((fact) => fact.evidence_ref),
            diff.added_settings,
            hasProgressionSignal(diff.added_settings) ? "SUPERSEDED" : "CONTRADICTED",
            diff.added_settings.length > 1 ? 0.66 : 0.78,
            diff.added_settings.length === 1 ? "PATCH_IN_PLACE" : "HUMAN_REVIEW",
            diff.added_settings.length === 1
                ? "setting renamed but location lineage appears close to approved canon"
                : "multiple new settings diverge from active chapter-local canon"
        );
    }
    if (diff.added_objects.length > 0) {
        pushCause(
            "object",
            "OBJECT_DRIFT",
            diff.added_objects.length > 1 ? "MEDIUM" : "LOW",
            findLifecycleFacts(args.pack.factLifecycleFacts, "object", args.pack.canonicalObjectFacts).map((fact) => fact.evidence_ref),
            diff.added_objects,
            diff.added_objects.length === 1 ? "SUPERSEDED" : "MISSING",
            diff.added_objects.length === 1 ? 0.81 : 0.62,
            diff.added_objects.length === 1 ? "PATCH_IN_PLACE" : "REANALYZE",
            diff.added_objects.length === 1
                ? "object identity changed but same lineage likely exists in current chapter memory"
                : "important objects drift beyond current approved memory pack"
        );
    }
    if (diff.unknown_characters_in_beats.length > 0) {
        pushCause(
            "character_state",
            "CHARACTER_STATE_DRIFT",
            "HIGH",
            args.pack.characterStateCards.flatMap((card) => card.evidence_ids.slice(0, 2)),
            diff.unknown_characters_in_beats,
            "CONTRADICTED",
            0.92,
            "HUMAN_REVIEW",
            "beat cast introduces actors that do not exist in active chapter-aware character state"
        );
    }
    if (diff.timeline_anchor_mismatch.length > 0) {
        pushCause(
            "timeline",
            "TIMELINE_DRIFT",
            diff.timeline_anchor_mismatch.length > 1 ? "HIGH" : "MEDIUM",
            findLifecycleFacts(args.pack.factLifecycleFacts, "timeline", args.pack.timelineLines).map((fact) => fact.evidence_ref),
            diff.timeline_anchor_mismatch,
            hasProgressionSignal(diff.timeline_anchor_mismatch) ? "SUPERSEDED" : "MISSING",
            hasProgressionSignal(diff.timeline_anchor_mismatch) ? 0.83 : 0.58,
            hasProgressionSignal(diff.timeline_anchor_mismatch) ? "REANALYZE" : "HUMAN_REVIEW",
            hasProgressionSignal(diff.timeline_anchor_mismatch)
                ? "timeline progressed beyond previous anchor and should refresh chapter-local truth"
                : "beats lack enough timeline evidence to prove ordered progression"
        );
    }
    if (diff.dropped_hooks.length > 0) {
        pushCause(
            "hook",
            "HOOK_DROP",
            diff.dropped_hooks.length > 1 ? "MEDIUM" : "LOW",
            findLifecycleFacts(args.pack.factLifecycleFacts, "hook", args.pack.carryForwardHooks).map((fact) => fact.evidence_ref),
            diff.dropped_hooks,
            hasProgressionSignal(args.plan.beats.map((beat) => beat.description)) ? "CLOSED" : "MISSING",
            hasProgressionSignal(args.plan.beats.map((beat) => beat.description)) ? 0.79 : 0.52,
            hasProgressionSignal(args.plan.beats.map((beat) => beat.description)) ? "CONTINUE" : "REANALYZE",
            hasProgressionSignal(args.plan.beats.map((beat) => beat.description))
                ? "hook intentionally closed by chapter event progression"
                : "carry-forward hook disappeared without explicit closure evidence"
        );
    }

    if (args.analysisInsufficient) {
        pushCause(
            "timeline",
            "ANALYSIS_INSUFFICIENT",
            "HIGH",
            [],
            [],
            "MISSING",
            0.95,
            "HUMAN_REVIEW",
            "recent approved structured analysis is missing, so dynamic canon cannot be trusted for auto-write"
        );
    }

    const affectedDimensions = uniqueStrings(causes.map((cause) => cause.dimension), 8) as FactDimension[];
    const unresolvedCount = causes.filter((cause) => cause.recommended_action === "HUMAN_REVIEW").length;
    const retconRequired = hasRetconSignal(args.userPrompt) || (
        args.writingIntentMode === "CONTINUE_CANON" &&
        causes.some((cause) => cause.dimension === "character_state" && cause.severity === "HIGH")
    );
    const patchPossible = causes.length > 0 && causes.every((cause) => cause.recommended_action === "PATCH_IN_PLACE" || cause.recommended_action === "CONTINUE");
    const progressionPossible = !patchPossible && causes.length > 0 && causes.every((cause) => cause.recommended_action === "REANALYZE" || cause.recommended_action === "CONTINUE");

    let classification: CanonDeltaClassification = "UNRESOLVED_CONFLICT";
    let recommendedAction: RecoveryAction = "HUMAN_REVIEW";
    let conflictResolutionMode: ConflictResolutionMode = "human_review";
    if (args.analysisInsufficient) {
        classification = "UNRESOLVED_CONFLICT";
    } else if (retconRequired) {
        classification = "RETCON_REQUIRED";
        recommendedAction = "RETCON_REWRITE";
        conflictResolutionMode = args.writingIntentMode === "RETCON_REWRITE" ? "retcon" : "human_review";
    } else if (patchPossible) {
        classification = "LOCAL_PATCH_POSSIBLE";
        recommendedAction = "PATCH_IN_PLACE";
        conflictResolutionMode = "local_patch";
    } else if (progressionPossible) {
        classification = "VALID_PROGRESSION";
        recommendedAction = "REANALYZE";
        conflictResolutionMode = "reanalysis";
    }
    if (causes.length === 0) {
        classification = "VALID_PROGRESSION";
        recommendedAction = "CONTINUE";
        conflictResolutionMode = "none";
    }

    const supersededFactRefs = uniqueStrings(
        causes.filter((cause) => cause.disposition === "SUPERSEDED" || cause.disposition === "CLOSED").flatMap((cause) => cause.evidence_refs),
        16
    );
    const proposedNewFacts = uniqueStrings(causes.flatMap((cause) => cause.candidate_new_facts), 16);
    const confidence = causes.length === 0
        ? 0.95
        : Number((causes.reduce((sum, cause) => sum + cause.confidence, 0) / causes.length).toFixed(3));
    const summary = args.analysisInsufficient
        ? "analysis insufficient: recent chapter-aware memory is missing"
        : classification === "VALID_PROGRESSION"
            ? "dynamic canon progression accepted after continuity analysis"
            : classification === "LOCAL_PATCH_POSSIBLE"
                ? "narrow canon drift detected and patchable in plan context"
                : classification === "RETCON_REQUIRED"
                    ? "chapter request implies canon rewrite and requires retcon policy"
                    : "canon conflict remains unresolved after root-cause analysis";
    return {
        classification,
        confidence,
        recommendedAction,
        conflictResolutionMode,
        affectedDimensions,
        supersededFactRefs,
        proposedNewFacts,
        rootCauses: causes,
        summary,
        unresolvedCount,
    };
}

function patchPlanInPlace(args: {
    plan: ChapterPlanResult["plan"];
    pack: PlanningMemoryPack;
    analysis: CanonDeltaAnalysis;
}): ChapterPlanResult["plan"] {
    if (args.analysis.classification !== "LOCAL_PATCH_POSSIBLE") return args.plan;
    const primarySetting = args.pack.canonicalSettingFacts[0] || args.plan.context_guard.location_anchor;
    const primaryObject = args.pack.canonicalObjectFacts[0] || "";
    const requiredHooks = uniqueStrings([...args.plan.context_guard.active_plot_threads, ...args.pack.carryForwardHooks], 12);
    const patchedBeats = args.plan.beats.map((beat) => ({
        ...beat,
        location: primarySetting && args.analysis.affectedDimensions.includes("setting") ? primarySetting : beat.location,
        description: primaryObject && args.analysis.affectedDimensions.includes("object") && !beat.description.toLowerCase().includes(primaryObject.toLowerCase())
            ? `${beat.description} ${primaryObject}`.trim()
            : beat.description,
    }));
    return {
        ...args.plan,
        beats: patchedBeats,
        context_guard: {
            ...args.plan.context_guard,
            location_anchor: primarySetting || args.plan.context_guard.location_anchor,
            important_objects: primaryObject ? uniqueStrings([primaryObject, ...args.plan.context_guard.important_objects], 8) : args.plan.context_guard.important_objects,
            active_plot_threads: requiredHooks,
        },
    };
}

function renderPlanningPrompt(args: {
    chapterId: string;
    targetWordCount: number;
    userPrompt?: string;
    truthContextPack: TruthContextPackV1;
    canonLines: string[];
    relationshipLines: string[];
    timelineLines: string[];
    worldCoreLines: string[];
    canonicalSettingFacts: string[];
    canonicalObjectFacts: string[];
    characterStateCards: Array<{
        entity: string;
        role: string;
        type: string;
        age_band: string;
        affiliation: string;
        current_state: string;
    }>;
    carryForwardHooks: string[];
    openLoops: string[];
    allowedCharacters: string[];
    forceStrictCast?: boolean;
    previousUnknownCharacters?: string[];
    forceStrictLocations?: boolean;
    previousUnknownLocations?: string[];
}): string {
    const priorityA = asRecord(args.truthContextPack.priority_a);
    const priorityB = asRecord(args.truthContextPack.priority_b);
    const truthPackSummary = JSON.stringify({
        chapter_profile: args.truthContextPack.chapter_profile,
        priority_a: priorityA,
        priority_b: priorityB,
        compression_drops: args.truthContextPack.compression_drops,
        token_budget_stats: args.truthContextPack.token_budget_stats,
    }, null, 2);
    const canon = args.canonLines.slice(0, 20).join("\n") || "- (none)";
    const relationships = args.relationshipLines.slice(0, 20).join("\n") || "- (none)";
    const timeline = args.timelineLines.slice(0, 20).join("\n") || "- (none)";
    const worldCore = args.worldCoreLines.slice(0, 16).join("\n") || "- (none)";
    const settings = args.canonicalSettingFacts.slice(0, 12).join("\n") || "- (none)";
    const objects = args.canonicalObjectFacts.slice(0, 12).join("\n") || "- (none)";
    const hooks = args.carryForwardHooks.slice(0, 12).join("\n") || "- (none)";
    const loops = args.openLoops.slice(0, 12).join("\n") || "- (none)";
    const cards = args.characterStateCards.slice(0, 20).map((card) =>
        `- ${card.entity} | role:${card.role} type:${card.type} age_band:${card.age_band} affiliation:${card.affiliation} state:${card.current_state}`
    ).join("\n") || "- (none)";
    const allowedCharacters = args.allowedCharacters.length > 0 ? args.allowedCharacters.join(", ") : "(none)";
    const userInstruction = cleanText(args.userPrompt);
    const hasApprovedLocations = args.canonicalSettingFacts.length > 0;
    const hasApprovedObjects = args.canonicalObjectFacts.length > 0;
    const allowedLocations = hasApprovedLocations ? args.canonicalSettingFacts.slice(0, 12).join(", ") : "(no approved locations yet — may invent story-appropriate settings)";
    const allowedObjects = hasApprovedObjects ? args.canonicalObjectFacts.slice(0, 12).join(", ") : "(no approved objects yet — may use contextually appropriate objects)";

    const strictBlock = args.forceStrictCast
        ? `\nCAST GUARD VIOLATION FROM PREVIOUS ATTEMPT:\n- Invalid characters used: ${(args.previousUnknownCharacters || []).join(", ") || "(unknown)"}\n- You MUST replace them with names from ALLOWED_CHARACTERS only.\n`
        : "";
    const strictLocationBlock = args.forceStrictLocations
        ? `\nLOCATION GUARD VIOLATION FROM PREVIOUS ATTEMPT:\n- Invalid locations used: ${(args.previousUnknownLocations || []).join(", ") || "(unknown)"}\n- You MUST use only locations from ALLOWED_LOCATIONS.\n`
        : "";

    return `
You are the CHAPTER ARCHITECT AGENT.
Output language: English.
Return STRICT JSON only. No markdown, no commentary.

TASK:
Build a chapter beat plan for chapter "${args.chapterId}" with total target ${args.targetWordCount} words.

HARD RULES:
1. Keep canon and timeline consistency.
2. Use 3 to 6 beats.
3. Every beat must include: label, description, location, characters, estimated_words.
4. Characters must be non-empty and grounded in context.
5. Characters MUST come strictly from ALLOWED_CHARACTERS. Do NOT introduce new names.
6. ${hasApprovedLocations ? "Locations MUST come from ALLOWED_LOCATIONS or be a clearly described sub-area of one. Do NOT invent entirely new locations." : "You may introduce new locations appropriate to the story setting."}
7. ${hasApprovedObjects ? "Important objects in context_guard SHOULD be from ALLOWED_OBJECTS or directly related. Avoid inventing completely new key objects." : "You may introduce objects appropriate to the story."}
8. context_guard must include: location_anchor, active_plot_threads, important_objects.
9. Keep the sum of estimated_words approximately equal to ${args.targetWordCount}.

USER INSTRUCTION:
${userInstruction || "(none)"}

ALLOWED_CHARACTERS:
${allowedCharacters}
${strictBlock}
ALLOWED_LOCATIONS:
${allowedLocations}
${strictLocationBlock}
ALLOWED_OBJECTS:
${allowedObjects}

CANON:
${canon}

RELATIONSHIPS:
${relationships}

TIMELINE:
${timeline}

WORLD CORE:
${worldCore}

CANONICAL_SETTING_FACTS:
${settings}

CANONICAL_OBJECT_FACTS:
${objects}

CHARACTER_STATE_CARDS:
${cards}

CARRY_FORWARD_HOOKS:
${hooks}

OPEN_LOOPS:
${loops}

TRUTH_CONTEXT_PACK_V1:
${truthPackSummary}

OUTPUT JSON SHAPE:
{
  "title": "string",
  "summary": "string",
  "beats": [
    {
      "label": "string",
      "description": "string",
      "location": "string",
      "characters": ["string"],
      "estimated_words": 500
    }
  ],
  "context_guard": {
    "location_anchor": "string",
    "active_plot_threads": ["string"],
    "important_objects": ["string"]
  }
}
`.trim();
}

export async function runChapterPlanning(
    pool: Pool,
    args: ChapterPlanArgs
): Promise<ChapterPlanResult> {
    const startedAt = Date.now();
    console.info(
        "[writing.plan.start]",
        JSON.stringify({
            story_id: args.storyId,
            chapter_id: args.chapterId,
            target_word_count: args.targetWordCount,
            task_type: "CHAPTER_PLAN",
        })
    );
    try {
        const writingIntentMode = args.writingIntentMode === "RETCON_REWRITE" ? "RETCON_REWRITE" : "CONTINUE_CANON";
        let pack = await buildPlanningMemoryPackV5(pool, args);
        let writingContext = buildWritingContextFromPlanning({
            storyId: args.storyId,
            storySlug: args.storySlug,
            chapterId: args.chapterId,
            targetWordCount: args.targetWordCount,
            userPrompt: args.userPrompt,
            writingIntentMode,
            pack,
        });
        console.info(
            "[writing.context.diagnostic]",
            JSON.stringify({
                story_id: args.storyId,
                chapter_id: args.chapterId,
                readiness: writingContext.debug_source_metadata.readiness.status,
                reasons: writingContext.debug_source_metadata.readiness.reasons,
                evidence_refs_count: writingContext.debug_source_metadata.evidence_refs.length,
                degraded_reasons: writingContext.debug_source_metadata.degraded_reasons,
            })
        );
        if (pack.allowedCharacters.length === 0) {
            throw new Error("PLAN_INVALID_NO_ALLOWED_CHARACTERS");
        }
        let replanTriggered = false;
        let unknownCharacterHits: string[] = [];
        let finalPlan: ChapterPlanResult["plan"] | null = null;
        let reanalysisActions: ReanalysisActionReport = {
            attempted: false,
            mode: "none",
            result: "not_needed",
            refreshed_snapshot_refs: [],
        };

        for (let attempt = 0; attempt < 2; attempt += 1) {
            const planningPrompt = renderPlanningPrompt({
                chapterId: args.chapterId,
                targetWordCount: args.targetWordCount,
                userPrompt: args.userPrompt,
                truthContextPack: pack.truthContextPackV1,
                canonLines: pack.canonLines,
                relationshipLines: pack.relationshipLines,
                timelineLines: pack.timelineLines,
                worldCoreLines: pack.worldCoreLines,
                canonicalSettingFacts: pack.canonicalSettingFacts,
                canonicalObjectFacts: pack.canonicalObjectFacts,
                characterStateCards: pack.characterStateCards,
                carryForwardHooks: pack.carryForwardHooks,
                openLoops: pack.openLoops,
                allowedCharacters: pack.allowedCharacters,
                forceStrictCast: attempt > 0,
                previousUnknownCharacters: unknownCharacterHits,
            });

            const llmResponse = await callChatCompletionJson({
                messages: [{ role: "user", content: planningPrompt }],
                temperature: 0.35,
                maxTokens: 1800,
                timeoutMs: 45000,
            });

            const parsed = parseJsonLoose(llmResponse.content);
            const normalized = normalizePlan(parsed, args.chapterId, args.targetWordCount);
            const characterCheck = validatePlanCharacters(normalized, pack.allowedCharacters);
            unknownCharacterHits = characterCheck.unknown;
            if (unknownCharacterHits.length === 0) {
                finalPlan = normalized;
                break;
            }
            if (attempt === 0) {
                replanTriggered = true;
                continue;
            }
            throw new Error(`PLAN_INVALID_UNKNOWN_CHARACTER:${unknownCharacterHits.join(",")}`);
        }
        if (!finalPlan) throw new Error("PLAN_INVALID_UNKNOWN_CHARACTER");

        const contractMin = Math.max(400, Math.floor(args.targetWordCount * 0.75));
        const contractMax = Math.max(contractMin + 200, Math.floor(args.targetWordCount * 1.25));
        const sceneCount = finalPlan.beats.length;
        const planningGuard = validatePlanCharacters(finalPlan, pack.allowedCharacters);
        let continuity = evaluateContinuityGate({
            plan: finalPlan,
            pack,
            writingIntentMode,
        });
        const hasContinuityDrift = continuity.gate.drift_classes.length > 0;
        const analysisInsufficient =
            (pack.memoryRuntimeV5?.used_counts_by_layer?.recent_structured || 0) === 0 ||
            (pack.memoryRuntimeV5?.evidence_refs?.canon_refs?.length || 0) === 0;
        let canonDelta = analyzeCanonDelta({
            plan: finalPlan,
            pack,
            continuity,
            writingIntentMode,
            userPrompt: args.userPrompt,
            analysisInsufficient,
        });
        if (hasContinuityDrift && canonDelta.classification === "LOCAL_PATCH_POSSIBLE") {
            finalPlan = patchPlanInPlace({
                plan: finalPlan,
                pack,
                analysis: canonDelta,
            });
            continuity = evaluateContinuityGate({
                plan: finalPlan,
                pack,
                writingIntentMode,
            });
            canonDelta = analyzeCanonDelta({
                plan: finalPlan,
                pack,
                continuity,
                writingIntentMode,
                userPrompt: args.userPrompt,
                analysisInsufficient,
            });
        } else if (hasContinuityDrift && canonDelta.classification === "VALID_PROGRESSION") {
            reanalysisActions = {
                attempted: true,
                mode: "memory_refresh",
                result: analysisInsufficient ? "analysis_insufficient" : "accepted_after_refresh",
                refreshed_snapshot_refs: pack.memoryRuntimeV5?.evidence_refs?.snapshot_refs || [],
            };
            if (!analysisInsufficient) {
                pack = await buildPlanningMemoryPackV5(pool, args);
                writingContext = buildWritingContextFromPlanning({
                    storyId: args.storyId,
                    storySlug: args.storySlug,
                    chapterId: args.chapterId,
                    targetWordCount: args.targetWordCount,
                    userPrompt: args.userPrompt,
                    writingIntentMode,
                    pack,
                });
                console.info(
                    "[writing.context.diagnostic]",
                    JSON.stringify({
                        story_id: args.storyId,
                        chapter_id: args.chapterId,
                        readiness: writingContext.debug_source_metadata.readiness.status,
                        reasons: writingContext.debug_source_metadata.readiness.reasons,
                        evidence_refs_count: writingContext.debug_source_metadata.evidence_refs.length,
                        degraded_reasons: writingContext.debug_source_metadata.degraded_reasons,
                        refreshed: true,
                    })
                );
                continuity = evaluateContinuityGate({
                    plan: finalPlan,
                    pack,
                    writingIntentMode,
                });
                canonDelta = analyzeCanonDelta({
                    plan: finalPlan,
                    pack,
                    continuity,
                    writingIntentMode,
                    userPrompt: args.userPrompt,
                    analysisInsufficient: (pack.memoryRuntimeV5?.used_counts_by_layer?.recent_structured || 0) === 0,
                });
            }
        }
        const beatEvidence = finalPlan.beats.map((beat) => {
            const refs = uniqueStrings(
                beat.characters.flatMap((name) => pack.characterEvidenceMap[name] || []),
                8
            );
            const fallback = pack.sourceSnapshotIds.map((id) => `snap:${id}`).slice(0, 4);
            return refs.length > 0 ? refs : fallback;
        });
        const entityMergeChallenges: EntityMergeChallengeV1[] = pack.conflictReport.conflicts
            .filter((conflict) => conflict.status === "REQUIRES_HUMAN_REVIEW")
            .map((conflict) => ({
                challenged_entity_id: conflict.entity_key,
                conflicting_surface_forms: [conflict.entity_key],
                challenge_reason: conflict.conflict_type || "ENTITY_REVIEW_REQUIRED",
                confidence: 0.5,
                affected_fact_refs: (pack.characterEvidenceMap[conflict.entity_key.replace(/\b\w/g, (m) => m.toUpperCase())] || []).slice(0, 6),
                recommended_action: "HUMAN_REVIEW",
                severity: conflict.canonical_role === "ACTOR" ? "high" : "medium",
            }));
        const analysisDeltaReport = buildAnalysisDeltaReportV1({
            chapterId: args.chapterId,
            sourceHashInput: {
                cache_key: pack.entityResolutionCacheV1.cache_key,
                policy_version: pack.packBudgetPolicyV1.policy_version,
                chapter_profile: pack.preChapterProfileV1,
                delta_classification: canonDelta.classification,
                conflict_report: pack.conflictReport,
            },
            fallbacksApplied: uniqueStrings(
                [
                    ...(pack.memoryRuntimeV5.degraded_reasons || []),
                    ...((reanalysisActions.attempted && reanalysisActions.result !== "accepted_after_refresh") ? [reanalysisActions.result] : []),
                ],
                12
            ),
            compressionDrops: pack.truthContextPackV1.compression_drops,
            threadsEscalated: pack.truthContextPackV1.thread_pressure_summary.active_threads,
            stalenessFlags: pack.truthContextPackV1.staleness_flags.filter((item) => item.stale).map((item) => item.entity_id),
            items: uniqueStrings(
                [
                    ...pack.truthContextPackV1.compression_drops.map((drop) => `compression:${drop}`),
                    ...entityMergeChallenges.map((challenge) => `entity_merge_challenge:${challenge.challenged_entity_id}`),
                    ...(canonDelta.classification !== "VALID_PROGRESSION" ? [`canon_delta:${canonDelta.classification}`] : []),
                ],
                32
            ).map((detail) => ({
                kind: detail.split(":")[0] || "delta",
                significance: detail.startsWith("entity_merge_challenge:")
                    ? "high"
                    : detail.startsWith("canon_delta:") && canonDelta.classification === "UNRESOLVED_CONFLICT"
                        ? "critical"
                        : detail.startsWith("compression:")
                            ? "medium"
                            : "low",
                detail,
                refs: detail.startsWith("entity_merge_challenge:")
                    ? entityMergeChallenges.filter((challenge) => detail.endsWith(challenge.challenged_entity_id)).flatMap((challenge) => challenge.affected_fact_refs)
                    : [],
            })),
        });
        const planWithContract: ChapterPlanResult["plan"] = {
            ...finalPlan,
            beats: finalPlan.beats.map((beat, idx) => ({
                ...beat,
                evidence_ids: beatEvidence[idx] || [],
            })),
            chapter_output_contract_v1: {
                word_range: { min: contractMin, target: args.targetWordCount, max: contractMax },
                scene_range: { min: Math.max(2, Math.min(3, sceneCount)), max: Math.max(4, sceneCount) },
                pacing_target: "balanced_progression",
                voice_target: "consistent_story_voice",
                taboo_constraints: [],
            },
            memory_runtime_v5: {
                ...pack.memoryRuntimeV5,
                degraded_reasons: uniqueStrings(
                    [
                        ...(pack.memoryRuntimeV5?.degraded_reasons || []),
                        ...(pack.memoryRuntimeV5?.used_counts_by_layer?.recent_structured === 0 ? ["MISSING_RECENT_STRUCTURED"] : []),
                    ],
                    12
                ),
            },
            planning_guard_v1: {
                allowed_characters: pack.allowedCharacters,
                characters_used: planningGuard.used,
                unknown_character_hits: planningGuard.unknown,
                replan_triggered: replanTriggered,
            },
            conflict_report_v1: pack.conflictReport,
            resolution_status: pack.conflictReport.unresolved_critical_count > 0 ? "REQUIRES_HUMAN_REVIEW" : "AUTO_RESOLVED",
            blocked_by_conflict_review: pack.conflictReport.unresolved_critical_count > 0,
            blocked_by_canon_conflict:
                canonDelta.classification === "UNRESOLVED_CONFLICT" ||
                (canonDelta.classification === "RETCON_REQUIRED" && writingIntentMode !== "RETCON_REWRITE"),
            blocked_reason:
                pack.conflictReport.unresolved_critical_count > 0
                    ? "BLOCKED_BY_CONFLICT_REVIEW"
                    : (
                        canonDelta.classification === "RETCON_REQUIRED" && writingIntentMode !== "RETCON_REWRITE"
                            ? "RETCON_REQUIRED"
                            : (canonDelta.classification === "UNRESOLVED_CONFLICT" ? "BLOCKED_BY_CANON_CONFLICT" : null)
                    ),
            writing_intent_mode: writingIntentMode,
            retcon_accepted: writingIntentMode === "RETCON_REWRITE" && canonDelta.classification === "RETCON_REQUIRED",
            plan_continuity_gate_v1: continuity.gate,
            canonical_diff_preview: continuity.diff,
            character_state_cards_used: pack.characterStateCards,
            continuity_evidence_refs: uniqueStrings(
                [
                    ...(pack.memoryRuntimeV5.evidence_refs.snapshot_refs || []),
                    ...(pack.memoryRuntimeV5.evidence_refs.arc_refs || []),
                    ...(pack.memoryRuntimeV5.evidence_refs.saga_refs || []),
                    ...(pack.memoryRuntimeV5.evidence_refs.core_refs || []),
                ],
                32
            ),
            entity_assignments: pack.entityAssignments,
            fact_lifecycle_v1: {
                active_facts: pack.factLifecycleFacts.filter((fact) => fact.lifecycle_state === "ACTIVE"),
                non_active_facts: pack.factLifecycleFacts.filter((fact) => fact.lifecycle_state !== "ACTIVE"),
            },
            canon_delta_report_v1: {
                classification: canonDelta.classification,
                confidence: canonDelta.confidence,
                affected_dimensions: canonDelta.affectedDimensions,
                recommended_action: canonDelta.recommendedAction,
                superseded_fact_refs: canonDelta.supersededFactRefs,
                proposed_new_facts: canonDelta.proposedNewFacts,
            },
            conflict_root_cause_v1: {
                summary: canonDelta.summary,
                unresolved_count: canonDelta.unresolvedCount,
                checks: canonDelta.rootCauses,
            },
            reanalysis_actions_v1: reanalysisActions,
            conflict_resolution_mode:
                pack.conflictReport.unresolved_critical_count > 0
                    ? "human_review"
                    : (canonDelta.classification === "RETCON_REQUIRED" && writingIntentMode === "RETCON_REWRITE"
                        ? "retcon"
                        : canonDelta.conflictResolutionMode),
            delta_classification: canonDelta.classification,
            superseded_fact_refs: canonDelta.supersededFactRefs,
            new_fact_candidates: canonDelta.proposedNewFacts,
            pack_budget_policy_v1: pack.packBudgetPolicyV1,
            pre_chapter_profile_v1: pack.preChapterProfileV1,
            truth_context_pack_v1: pack.truthContextPackV1,
            analysis_delta_report_v1: analysisDeltaReport,
            entity_merge_challenge_v1: entityMergeChallenges,
            entity_resolution_cache_v1: pack.entityResolutionCacheV1,
        };
        if (pack.conflictReport.unresolved_critical_count > 0) {
            planWithContract.blocked_by_conflict_review = true;
        }
        if (planWithContract.blocked_by_canon_conflict) {
            planWithContract.blocked_reason = String(planWithContract.blocked_reason || "BLOCKED_BY_CANON_CONFLICT");
        }
        const latencyMs = Date.now() - startedAt;
        console.info(
            "[writing.plan.done]",
            JSON.stringify({
                story_id: args.storyId,
                chapter_id: args.chapterId,
                task_type: "CHAPTER_PLAN",
                beats_count: planWithContract.beats.length,
                latency_ms: latencyMs,
                planning_guard: {
                    allowed_characters_count: planWithContract.planning_guard_v1?.allowed_characters.length || 0,
                    unknown_character_hits: planWithContract.planning_guard_v1?.unknown_character_hits || [],
                    replan_triggered: Boolean(planWithContract.planning_guard_v1?.replan_triggered),
                },
                delta_classification: planWithContract.delta_classification || null,
                conflict_resolution_mode: planWithContract.conflict_resolution_mode || "none",
                llm_tokens: null,
            })
        );

        return {
            ok: true,
            chapter_id: args.chapterId,
            target_word_count: args.targetWordCount,
            plan: planWithContract,
        };
    } catch (error: unknown) {
        const latencyMs = Date.now() - startedAt;
        console.error(
            "[writing.plan.failed]",
            JSON.stringify({
                story_id: args.storyId,
                chapter_id: args.chapterId,
                task_type: "CHAPTER_PLAN",
                latency_ms: latencyMs,
                error: error instanceof Error ? error.message : "PLAN_FAILED",
            })
        );
        throw error;
    }
}
