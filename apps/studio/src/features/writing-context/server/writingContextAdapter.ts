import { evaluateWritingContextReadiness } from "./readiness";
import type {
    WritingContext,
    WritingContextConflictStatus,
    WritingContextCurrentness,
    WritingContextFact,
    WritingContextSourceSystem,
    WritingContextUncertainty,
    WritingFactMetadata,
} from "./types";

type EvidenceRefs = {
    canon_refs?: string[];
    timeline_refs?: string[];
    snapshot_refs?: string[];
    arc_refs?: string[];
    saga_refs?: string[];
    core_refs?: string[];
};

type PlanningMemoryPackLike = {
    canonLines?: string[];
    relationshipLines?: string[];
    timelineLines?: string[];
    worldCoreLines?: string[];
    canonicalSettingFacts?: string[];
    canonicalObjectFacts?: string[];
    characterStateCards?: Array<{
        entity: string;
        role: string;
        type: string;
        current_state: string;
        evidence_ids?: string[];
    }>;
    carryForwardHooks?: string[];
    openLoops?: string[];
    allowedCharacters?: string[];
    memoryRuntimeV5?: {
        used_counts_by_layer?: Record<string, number>;
        dropped_counts_by_layer?: Record<string, number>;
        degraded_reasons?: string[];
        evidence_refs?: EvidenceRefs;
    };
    sourceSnapshotIds?: number[];
    conflictReport?: {
        unresolved_critical_count?: number;
    };
    truthContextPackV1?: {
        priority_a?: Record<string, unknown>;
        priority_b?: Record<string, unknown>;
        staleness_flags?: Array<{ entity_id: string; stale: boolean }>;
    };
};

export type BuildWritingContextFromPlanningInput = {
    storyId: number;
    storySlug?: string;
    chapterId: string;
    targetWordCount: number;
    userPrompt?: string;
    writingIntentMode?: "CONTINUE_CANON" | "RETCON_REWRITE";
    pack: PlanningMemoryPackLike;
};

function metadata(args: {
    sourceSystem: WritingContextSourceSystem;
    sourceFunction: string;
    chapterId: string;
    sourceId?: string | number;
    confidence?: number | "unknown";
    currentness?: WritingContextCurrentness;
    conflictStatus?: WritingContextConflictStatus;
}): WritingFactMetadata {
    return {
        source_trace: {
            source_system: args.sourceSystem,
            source_file: sourceFileFor(args.sourceSystem),
            source_function: args.sourceFunction,
            source_id: args.sourceId,
            chapter_id: args.chapterId,
        },
        confidence: normalizeConfidence(args.confidence),
        currentness: args.currentness || "unknown",
        conflict_status: args.conflictStatus || "unknown",
    };
}

function sourceFileFor(sourceSystem: WritingContextSourceSystem): string | undefined {
    const sources: Partial<Record<WritingContextSourceSystem, string>> = {
        ts_planning: "apps/studio/src/features/scenes/server/workflow/steps/chapterPlanning.ts",
        truth_context_pack: "apps/studio/src/features/analysis/server/truthPackGovernance.ts",
        story_context_pack: "apps/studio/src/features/guard/server/storyContextBuilder.ts",
        working_set: "apps/studio/src/features/autowrite/server/chapterContextService.ts",
    };
    return sources[sourceSystem];
}

function normalizeConfidence(value: number | "unknown" | undefined): number | "unknown" {
    if (value === "unknown" || value === undefined || !Number.isFinite(value)) return "unknown";
    return Math.max(0, Math.min(1, value));
}

function fact(args: {
    kind: string;
    label: string;
    value?: string;
    sourceSystem: WritingContextSourceSystem;
    sourceFunction: string;
    chapterId: string;
    sourceId?: string | number;
    confidence?: number | "unknown";
    currentness?: WritingContextCurrentness;
    conflictStatus?: WritingContextConflictStatus;
}): WritingContextFact {
    return {
        kind: args.kind,
        label: args.label,
        value: args.value,
        metadata: metadata(args),
    };
}

function factsFromStrings(args: {
    values: string[] | undefined;
    kind: string;
    sourceSystem: WritingContextSourceSystem;
    sourceFunction: string;
    chapterId: string;
    currentness: WritingContextCurrentness;
    conflictStatus?: WritingContextConflictStatus;
    limit?: number;
}): WritingContextFact[] {
    return (args.values || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .slice(0, args.limit || 20)
        .map((value, index) =>
            fact({
                kind: args.kind,
                label: value,
                value,
                sourceSystem: args.sourceSystem,
                sourceFunction: args.sourceFunction,
                chapterId: args.chapterId,
                sourceId: `${args.kind}:${index}`,
                confidence: "unknown",
                currentness: args.currentness,
                conflictStatus: args.conflictStatus || "unknown",
            })
        );
}

function stringList(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => String(item || "").trim()).filter(Boolean);
}

function collectEvidenceRefs(refs: EvidenceRefs | undefined): string[] {
    if (!refs) return [];
    const keys: Array<keyof EvidenceRefs> = ["canon_refs", "timeline_refs", "snapshot_refs", "arc_refs", "saga_refs", "core_refs"];
    return keys.flatMap((key) => stringList(refs[key]));
}

function forbiddenRevealRules(input: BuildWritingContextFromPlanningInput): WritingContextFact[] {
    const priorityA = input.pack.truthContextPackV1?.priority_a || {};
    const priorityB = input.pack.truthContextPackV1?.priority_b || {};
    const priorityAVisibility = priorityA.knowledge_visibility as { reveal_sensitivity?: string } | undefined;
    const priorityBVisibility = priorityB.knowledge_visibility as { reveal_sensitivity?: string } | undefined;
    const rules = [
        ...stringList(priorityA.ambiguity_constraints),
        ...(priorityAVisibility?.reveal_sensitivity ? [`reveal_sensitivity:${priorityAVisibility.reveal_sensitivity}`] : []),
        ...(priorityBVisibility?.reveal_sensitivity ? [`reveal_sensitivity:${priorityBVisibility.reveal_sensitivity}`] : []),
    ];
    return factsFromStrings({
        values: Array.from(new Set(rules)),
        kind: "forbidden_reveal_rule",
        sourceSystem: "truth_context_pack",
        sourceFunction: "compileTruthContextPackV1",
        chapterId: input.chapterId,
        currentness: "current",
        conflictStatus: "clean",
    });
}

function uncertainties(input: BuildWritingContextFromPlanningInput): WritingContextUncertainty[] {
    const degraded = input.pack.memoryRuntimeV5?.degraded_reasons || [];
    const staleFlags = input.pack.truthContextPackV1?.staleness_flags || [];
    const fromDegraded: WritingContextUncertainty[] = degraded.map((reason) => ({
        code: reason,
        severity: "warning" as const,
        detail: reason,
        metadata: metadata({
            sourceSystem: "ts_planning",
            sourceFunction: "buildPlanningMemoryPackV5",
            chapterId: input.chapterId,
            sourceId: reason,
            currentness: "unknown",
            conflictStatus: reason.includes("CONFLICT") ? "conflicting" : "unknown",
        }),
    }));
    const fromStale: WritingContextUncertainty[] = staleFlags
        .filter((flag) => flag.stale)
        .map((flag) => ({
            code: "STALE_ENTITY_STATE",
            severity: "warning" as const,
            detail: flag.entity_id,
            metadata: metadata({
                sourceSystem: "truth_context_pack",
                sourceFunction: "compileTruthContextPackV1",
                chapterId: input.chapterId,
                sourceId: flag.entity_id,
                currentness: "stale",
                conflictStatus: "unknown",
            }),
        }));
    const out = [...fromDegraded, ...fromStale];
    if ((input.pack.conflictReport?.unresolved_critical_count || 0) === 0) return out;
    out.push({
        code: "UNRESOLVED_CRITICAL_CONFLICT",
        severity: "blocking",
        detail: "Planning pack reports unresolved critical conflicts.",
        metadata: metadata({
            sourceSystem: "ts_planning",
            sourceFunction: "buildPlanningMemoryPackV5",
            chapterId: input.chapterId,
            currentness: "current",
            conflictStatus: "conflicting",
        }),
    });
    return out;
}

export function buildWritingContextFromPlanning(input: BuildWritingContextFromPlanningInput): WritingContext {
    const evidenceRefs = collectEvidenceRefs(input.pack.memoryRuntimeV5?.evidence_refs);
    const characterStates = (input.pack.characterStateCards || []).map((card) =>
        fact({
            kind: "character_state",
            label: card.entity,
            value: card.current_state,
            sourceSystem: "ts_planning",
            sourceFunction: "buildPlanningMemoryPackV5",
            chapterId: input.chapterId,
            sourceId: card.evidence_ids?.[0] || card.entity,
            confidence: "unknown",
            currentness: "current",
            conflictStatus: "clean",
        })
    );
    const allowedCharacters = factsFromStrings({
        values: input.pack.allowedCharacters,
        kind: "allowed_character",
        sourceSystem: "truth_context_pack",
        sourceFunction: "compileTruthContextPackV1",
        chapterId: input.chapterId,
        currentness: "current",
        conflictStatus: "clean",
    });
    const forbiddenRules = forbiddenRevealRules(input);
    const context: WritingContext = {
        contract_version: "writing_context_v1",
        intent: {
            story_id: input.storyId,
            story_slug: input.storySlug,
            chapter_id: input.chapterId,
            chapter_goal: String(input.userPrompt || "").trim(),
            writing_intent_mode: input.writingIntentMode === "RETCON_REWRITE" ? "RETCON_REWRITE" : "CONTINUE_CANON",
            target_word_count: input.targetWordCount,
            metadata: metadata({
                sourceSystem: "ts_planning",
                sourceFunction: "runChapterPlanning",
                chapterId: input.chapterId,
                currentness: "current",
                conflictStatus: "clean",
                confidence: 1,
            }),
        },
        immediate_continuity: {
            recent_snapshot_refs: (input.pack.sourceSnapshotIds || []).map((id) => `snap:${id}`),
            open_loops: factsFromStrings({
                values: input.pack.openLoops,
                kind: "open_thread",
                sourceSystem: "ts_planning",
                sourceFunction: "buildPlanningMemoryPackV5",
                chapterId: input.chapterId,
                currentness: "recent",
            }),
            carry_forward_hooks: factsFromStrings({
                values: input.pack.carryForwardHooks,
                kind: "carry_forward_hook",
                sourceSystem: "ts_planning",
                sourceFunction: "buildPlanningMemoryPackV5",
                chapterId: input.chapterId,
                currentness: "recent",
            }),
        },
        current_state: {
            active_cast: allowedCharacters,
            character_states: characterStates,
            setting_facts: factsFromStrings({
                values: input.pack.canonicalSettingFacts,
                kind: "setting_fact",
                sourceSystem: "truth_context_pack",
                sourceFunction: "compileTruthContextPackV1",
                chapterId: input.chapterId,
                currentness: "current",
                conflictStatus: "clean",
            }),
            object_facts: factsFromStrings({
                values: input.pack.canonicalObjectFacts,
                kind: "object_fact",
                sourceSystem: "truth_context_pack",
                sourceFunction: "compileTruthContextPackV1",
                chapterId: input.chapterId,
                currentness: "current",
                conflictStatus: "clean",
            }),
        },
        historical_memory: {
            canon: factsFromStrings({
                values: input.pack.canonLines,
                kind: "canon_fact",
                sourceSystem: "story_context_pack",
                sourceFunction: "buildStoryContextPack",
                chapterId: input.chapterId,
                currentness: "historical",
            }),
            relationships: factsFromStrings({
                values: input.pack.relationshipLines,
                kind: "relationship_state",
                sourceSystem: "story_context_pack",
                sourceFunction: "buildStoryContextPack",
                chapterId: input.chapterId,
                currentness: "historical",
            }),
            timeline: factsFromStrings({
                values: input.pack.timelineLines,
                kind: "timeline_anchor",
                sourceSystem: "story_context_pack",
                sourceFunction: "buildStoryContextPack",
                chapterId: input.chapterId,
                currentness: "historical",
            }),
            world: factsFromStrings({
                values: input.pack.worldCoreLines,
                kind: "world_rule",
                sourceSystem: "story_context_pack",
                sourceFunction: "buildStoryContextPack",
                chapterId: input.chapterId,
                currentness: "historical",
            }),
        },
        constraints: {
            allowed_characters: allowedCharacters,
            valid_anchors: factsFromStrings({
                values: input.pack.canonicalSettingFacts,
                kind: "valid_anchor",
                sourceSystem: "truth_context_pack",
                sourceFunction: "compileTruthContextPackV1",
                chapterId: input.chapterId,
                currentness: "current",
                conflictStatus: "clean",
            }),
            active_objects: factsFromStrings({
                values: input.pack.canonicalObjectFacts,
                kind: "active_object",
                sourceSystem: "truth_context_pack",
                sourceFunction: "compileTruthContextPackV1",
                chapterId: input.chapterId,
                currentness: "current",
                conflictStatus: "clean",
            }),
            open_threads: factsFromStrings({
                values: input.pack.carryForwardHooks,
                kind: "open_thread_constraint",
                sourceSystem: "ts_planning",
                sourceFunction: "buildPlanningMemoryPackV5",
                chapterId: input.chapterId,
                currentness: "recent",
            }),
            raw_priority_a: input.pack.truthContextPackV1?.priority_a,
            raw_priority_b: input.pack.truthContextPackV1?.priority_b,
        },
        forbidden_reveals: {
            required: forbiddenRules.length > 0,
            rules: forbiddenRules,
            contradictory: false,
        },
        style_anchors: {
            facts: [],
        },
        uncertainties: uncertainties(input),
        debug_source_metadata: {
            source_snapshot_ids: input.pack.sourceSnapshotIds || [],
            evidence_refs: evidenceRefs,
            used_counts_by_layer: input.pack.memoryRuntimeV5?.used_counts_by_layer || {},
            dropped_counts_by_layer: input.pack.memoryRuntimeV5?.dropped_counts_by_layer || {},
            degraded_reasons: input.pack.memoryRuntimeV5?.degraded_reasons || [],
            readiness: {
                status: "proceed",
                reasons: [],
            },
        },
    };
    const readiness = evaluateWritingContextReadiness(context);
    return {
        ...context,
        debug_source_metadata: {
            ...context.debug_source_metadata,
            readiness,
        },
    };
}
