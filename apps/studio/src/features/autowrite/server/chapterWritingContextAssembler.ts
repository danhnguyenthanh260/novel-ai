import { evaluateWritingContextReadiness } from "@/features/writing-context/server/readiness";
import type {
    WritingContext,
    WritingContextFact,
    WritingContextReadinessResult,
    WritingContextUncertainty,
    WritingFactMetadata,
} from "@/features/writing-context/server/types";
import type { WorkingSet } from "./chapterContextService";

export type ChapterWritingContextMode = "plan" | "prose" | "rewrite" | "validate";

export type ChapterContinuitySource = {
    source: "approved_document" | "chapter_draft" | "scene_version" | "working_set";
    refs: string[];
    draftOnly?: boolean;
};

export type AssembleChapterWritingContextInput = {
    workingSet: WorkingSet;
    storySlug?: string;
    userIntent: string;
    targetWordCount?: number;
    mode?: ChapterWritingContextMode;
    continuity?: ChapterContinuitySource;
    allowDegraded?: boolean;
};

export type ChapterWritingContextDebug = {
    assembler_version: "chapter_writing_context_assembler_v1";
    source_priority_applied: string[];
    included_sources: Array<{
        source: string;
        target_slot: string;
        count: number;
    }>;
    excluded_candidates: Array<{
        source: string;
        reason: string;
    }>;
    conflicts: string[];
    missing_required_slots: string[];
    degraded_reasons: string[];
    block_reasons: string[];
};

export type AssembleChapterWritingContextOutput = {
    context: WritingContext;
    preflight: WritingContextReadinessResult & {
        degraded_reasons: string[];
        block_reasons: string[];
        minimum_viable_context_met: boolean;
    };
    debug: ChapterWritingContextDebug;
};

const SOURCE_PRIORITY = ["user_intent", "approved_document_revision", "promoted_current_memory", "approved_analysis_snapshot", "v3_ledger_rollup_candidate", "draft_or_staged_prose", "compatibility_scene_version", "sql_facts", "external_retrieval", "fallback_builder"];

function chapterNumber(chapterId: string): number {
    return Number.parseInt(chapterId.replace(/\D/g, "") || "0", 10) || 0;
}

function hasText(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function cleanText(value: unknown): string {
    return hasText(value) ? value.trim() : "";
}

function isPlaceholder(value: unknown): boolean {
    const normalized = cleanText(value).toLowerCase();
    return normalized === "" || normalized === "n/a" || normalized === "unknown";
}

function metadata(args: {
    chapterId: string;
    sourceId?: string | number;
    currentness?: WritingFactMetadata["currentness"];
    conflictStatus?: WritingFactMetadata["conflict_status"];
    confidence?: WritingFactMetadata["confidence"];
}): WritingFactMetadata {
    return {
        source_trace: {
            source_system: "working_set",
            source_file: "apps/studio/src/features/autowrite/server/chapterContextService.ts",
            source_function: "buildWorkingSet",
            source_id: args.sourceId,
            chapter_id: args.chapterId,
        },
        confidence: args.confidence ?? "unknown",
        currentness: args.currentness ?? "unknown",
        conflict_status: args.conflictStatus ?? "unknown",
    };
}

function fact(args: {
    kind: string;
    label: string;
    chapterId: string;
    value?: string;
    sourceId?: string | number;
    currentness?: WritingFactMetadata["currentness"];
    conflictStatus?: WritingFactMetadata["conflict_status"];
}): WritingContextFact {
    return {
        kind: args.kind,
        label: args.label,
        value: args.value,
        metadata: metadata({
            chapterId: args.chapterId,
            sourceId: args.sourceId,
            currentness: args.currentness,
            conflictStatus: args.conflictStatus,
        }),
    };
}

function uncertainty(args: {
    code: string;
    detail: string;
    chapterId: string;
    severity?: WritingContextUncertainty["severity"];
    currentness?: WritingFactMetadata["currentness"];
}): WritingContextUncertainty {
    return {
        code: args.code,
        detail: args.detail,
        severity: args.severity ?? "warning",
        metadata: metadata({
            chapterId: args.chapterId,
            sourceId: args.code,
            currentness: args.currentness ?? "unknown",
            conflictStatus: "unknown",
        }),
    };
}

function factsFromStrings(args: {
    values: string[];
    kind: string;
    chapterId: string;
    currentness: WritingFactMetadata["currentness"];
}): WritingContextFact[] {
    return args.values
        .map(cleanText)
        .filter(Boolean)
        .map((value, index) =>
            fact({
                kind: args.kind,
                label: value,
                value,
                chapterId: args.chapterId,
                sourceId: `${args.kind}:${index}`,
                currentness: args.currentness,
            })
        );
}

function buildContinuityRefs(input: AssembleChapterWritingContextInput): string[] {
    const explicitRefs = input.continuity?.refs || [];
    if (explicitRefs.length > 0) return explicitRefs;
    const workingSet = input.workingSet;
    const hasWorkingSetContinuity =
        workingSet.meso_context.unresolved_loops.length > 0 ||
        workingSet.meso_context.milestone_summaries.length > 0 ||
        workingSet.ephemeral.recent_changes.length > 0;
    return hasWorkingSetContinuity ? [`working_set:${workingSet.snapshot_hash}`] : [];
}

function collectUncertainties(input: AssembleChapterWritingContextInput): WritingContextUncertainty[] {
    const { workingSet } = input;
    const chapterId = workingSet.chapter_id;
    const uncertainties: WritingContextUncertainty[] = [];

    if (isPlaceholder(workingSet.anchor.story_pitch)) {
        uncertainties.push(uncertainty({ code: "STORY_PITCH_UNKNOWN", detail: "WorkingSet anchor story pitch is missing.", chapterId }));
    }
    if (workingSet.anchor.world_rules.length === 0) {
        uncertainties.push(uncertainty({ code: "WORLD_RULES_PARTIAL", detail: "WorkingSet has no world rules.", chapterId }));
    }
    if (Object.keys(workingSet.active_state.world_flags || {}).length === 0) {
        uncertainties.push(uncertainty({ code: "CURRENT_WORLD_FLAGS_UNKNOWN", detail: "WorkingSet has no world flags.", chapterId }));
    }
    if (input.continuity?.draftOnly) {
        uncertainties.push(uncertainty({ code: "DRAFT_ONLY_CONTINUITY_USED", detail: "Continuity source is draft-only.", chapterId, currentness: "draft_only" }));
    }
    for (const cast of workingSet.active_state.cast) {
        if (isPlaceholder(cast.motivation)) {
            uncertainties.push(uncertainty({
                code: "CHARACTER_MOTIVATION_UNKNOWN",
                detail: `Motivation is unknown for ${cast.name}.`,
                chapterId,
            }));
        }
    }

    return uncertainties;
}

function preflightFor(context: WritingContext, input: AssembleChapterWritingContextInput): AssembleChapterWritingContextOutput["preflight"] {
    const readiness = evaluateWritingContextReadiness(context);
    const blockReasons = readiness.status === "blocked" ? [...readiness.reasons] : [];
    const degradedReasons = readiness.status === "degraded" ? [...readiness.reasons] : [];
    const continuityRefs = context.immediate_continuity.recent_snapshot_refs;

    if (chapterNumber(context.intent.chapter_id) > 1 && continuityRefs.length === 0) {
        blockReasons.push("CONTINUITY_REQUIRED_BUT_MISSING");
    }
    if (input.continuity?.draftOnly) {
        degradedReasons.push("DRAFT_ONLY_CONTINUITY_USED");
    }

    const uniqueBlocks = Array.from(new Set(blockReasons));
    const uniqueDegraded = Array.from(new Set(degradedReasons));
    const status = uniqueBlocks.length > 0 ? "blocked" : uniqueDegraded.length > 0 ? "degraded" : "proceed";

    return {
        status,
        reasons: status === "blocked" ? uniqueBlocks : uniqueDegraded,
        degraded_reasons: uniqueDegraded,
        block_reasons: uniqueBlocks,
        minimum_viable_context_met: uniqueBlocks.length === 0,
    };
}

type AssemblerParts = {
    continuityRefs: string[];
    uncertainties: WritingContextUncertainty[];
    activeCast: WritingContextFact[];
    characterStates: WritingContextFact[];
};

function buildParts(input: AssembleChapterWritingContextInput): AssemblerParts {
    const { workingSet } = input;
    const chapterId = workingSet.chapter_id;
    return {
        continuityRefs: buildContinuityRefs(input),
        uncertainties: collectUncertainties(input),
        activeCast: workingSet.active_state.cast.map((cast, index) =>
            fact({
                kind: "allowed_character",
                label: cast.name,
                value: cast.status,
                chapterId,
                sourceId: `cast:${index}`,
                currentness: "current",
                conflictStatus: "clean",
            })
        ),
        characterStates: workingSet.active_state.cast.map((cast, index) =>
            fact({
                kind: "character_state",
                label: cast.name,
                value: cast.status,
                chapterId,
                sourceId: `character_state:${index}`,
                currentness: "current",
                conflictStatus: "clean",
            })
        ),
    };
}

function buildImmediateContinuity(input: AssembleChapterWritingContextInput, parts: AssemblerParts): WritingContext["immediate_continuity"] {
    const chapterId = input.workingSet.chapter_id;
    return {
        recent_snapshot_refs: parts.continuityRefs,
        open_loops: input.workingSet.meso_context.unresolved_loops.map((loop, index) =>
            fact({
                kind: "open_thread",
                label: loop.description,
                value: loop.started_at,
                chapterId,
                sourceId: loop.id || `open_thread:${index}`,
                currentness: "recent",
            })
        ),
        carry_forward_hooks: factsFromStrings({
            values: input.workingSet.ephemeral.recent_changes,
            kind: "recent_change",
            chapterId,
            currentness: input.continuity?.draftOnly ? "draft_only" : "recent",
        }),
    };
}

function buildHistoricalMemory(input: AssembleChapterWritingContextInput): WritingContext["historical_memory"] {
    const chapterId = input.workingSet.chapter_id;
    return {
        canon: factsFromStrings({
            values: input.workingSet.meso_context.milestone_summaries,
            kind: "milestone_summary",
            chapterId,
            currentness: "historical",
        }),
        relationships: [],
        timeline: factsFromStrings({
            values: input.workingSet.active_state.timeline_facts,
            kind: "timeline_fact",
            chapterId,
            currentness: "historical",
        }),
        world: input.workingSet.anchor.world_rules.map((rule) =>
            fact({
                kind: "world_rule",
                label: rule.content,
                value: rule.content,
                chapterId,
                sourceId: rule.id,
                currentness: "current",
                conflictStatus: "clean",
            })
        ),
    };
}

function buildStyleAnchors(input: AssembleChapterWritingContextInput): WritingContext["style_anchors"] {
    const styleFacts = [input.workingSet.anchor.style_dna.tone, input.workingSet.anchor.style_dna.pacing, input.workingSet.anchor.style_dna.perspective]
        .filter((item) => !isPlaceholder(item));
    return {
        facts: factsFromStrings({
            values: styleFacts,
            kind: "style_anchor",
            chapterId: input.workingSet.chapter_id,
            currentness: "current",
        }),
    };
}

function buildContext(input: AssembleChapterWritingContextInput, parts: AssemblerParts): WritingContext {
    const { workingSet } = input;
    const chapterId = workingSet.chapter_id;
    return {
        contract_version: "writing_context_v1",
        intent: {
            story_id: workingSet.story_id,
            story_slug: input.storySlug,
            chapter_id: chapterId,
            chapter_goal: cleanText(input.userIntent),
            writing_intent_mode: "CONTINUE_CANON",
            target_word_count: input.targetWordCount || 2500,
            metadata: metadata({ chapterId, sourceId: "user_intent", currentness: "current", conflictStatus: "clean", confidence: 1 }),
        },
        immediate_continuity: buildImmediateContinuity(input, parts),
        current_state: {
            active_cast: parts.activeCast,
            character_states: parts.characterStates,
            setting_facts: [],
            object_facts: [],
        },
        historical_memory: buildHistoricalMemory(input),
        constraints: {
            allowed_characters: parts.activeCast,
            valid_anchors: [],
            active_objects: [],
            open_threads: [],
        },
        forbidden_reveals: {
            required: false,
            rules: [],
            contradictory: false,
        },
        style_anchors: buildStyleAnchors(input),
        uncertainties: parts.uncertainties,
        debug_source_metadata: {
            source_snapshot_ids: [],
            evidence_refs: parts.continuityRefs,
            used_counts_by_layer: {
                active_cast: parts.activeCast.length,
                recent_changes: workingSet.ephemeral.recent_changes.length,
                unresolved_loops: workingSet.meso_context.unresolved_loops.length,
                milestone_summaries: workingSet.meso_context.milestone_summaries.length,
            },
            dropped_counts_by_layer: {},
            degraded_reasons: parts.uncertainties.filter((item) => item.severity !== "info").map((item) => item.code),
            readiness: { status: "proceed", reasons: [] },
        },
    };
}

function withReadiness(context: WritingContext, preflight: AssembleChapterWritingContextOutput["preflight"]): WritingContext {
    return {
        ...context,
        debug_source_metadata: {
            ...context.debug_source_metadata,
            readiness: { status: preflight.status, reasons: preflight.reasons },
        },
    };
}

function missingRequiredSlots(input: AssembleChapterWritingContextInput, continuityRefs: string[]): string[] {
    return [
        !cleanText(input.userIntent) ? "intent" : "",
        chapterNumber(input.workingSet.chapter_id) > 1 && continuityRefs.length === 0 ? "immediate_continuity" : "",
    ].filter(Boolean);
}

function buildDebug(
    context: WritingContext,
    parts: AssemblerParts,
    preflight: AssembleChapterWritingContextOutput["preflight"],
    input: AssembleChapterWritingContextInput
): ChapterWritingContextDebug {
    return {
        assembler_version: "chapter_writing_context_assembler_v1",
        source_priority_applied: SOURCE_PRIORITY,
        included_sources: [
            { source: "working_set.anchor", target_slot: "style_anchors", count: context.style_anchors.facts.length },
            { source: "working_set.active_state", target_slot: "current_state", count: parts.activeCast.length + parts.characterStates.length },
            { source: "working_set.meso_context", target_slot: "immediate_continuity", count: context.immediate_continuity.open_loops.length },
            { source: "working_set.ephemeral", target_slot: "immediate_continuity", count: context.immediate_continuity.carry_forward_hooks.length },
        ],
        excluded_candidates: parts.uncertainties.map((item) => ({ source: "working_set", reason: item.code })),
        conflicts: [],
        missing_required_slots: missingRequiredSlots(input, parts.continuityRefs), degraded_reasons: preflight.degraded_reasons, block_reasons: preflight.block_reasons,
    };
}

export function assembleChapterWritingContext(input: AssembleChapterWritingContextInput): AssembleChapterWritingContextOutput {
    const parts = buildParts(input);
    const context = buildContext(input, parts);
    const preflight = preflightFor(context, input);
    return {
        context: withReadiness(context, preflight),
        preflight,
        debug: buildDebug(context, parts, preflight, input),
    };
}
