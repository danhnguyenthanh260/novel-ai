export type WritingContextReadiness = "proceed" | "degraded" | "blocked";

export type WritingContextCurrentness =
    | "current"
    | "recent"
    | "historical"
    | "stale"
    | "superseded"
    | "draft_only"
    | "unknown";

export type WritingContextConflictStatus =
    | "clean"
    | "conflicting"
    | "low_confidence"
    | "unvetted"
    | "incomplete_coverage"
    | "unknown";

export type WritingContextSourceSystem =
    | "ts_planning"
    | "story_context_pack"
    | "truth_context_pack"
    | "working_set"
    | "unknown";

export type WritingFactMetadata = {
    source_trace: {
        source_system: WritingContextSourceSystem;
        source_file?: string;
        source_function?: string;
        source_id?: string | number;
        chapter_id?: string;
    };
    /**
     * Confidence is normalized to 0.0-1.0, where 1.0 means fully verified canon.
     * Use "unknown" when a source does not expose a comparable confidence value.
     */
    confidence: number | "unknown";
    currentness: WritingContextCurrentness;
    conflict_status: WritingContextConflictStatus;
};

export type WritingContextFact = {
    kind: string;
    label: string;
    value?: string;
    metadata: WritingFactMetadata;
};

export type WritingContextUncertainty = {
    code: string;
    severity: "info" | "warning" | "blocking";
    detail: string;
    metadata: WritingFactMetadata;
};

export type WritingContext = {
    contract_version: "writing_context_v1";
    intent: {
        story_id: number;
        story_slug?: string;
        chapter_id: string;
        chapter_goal: string;
        writing_intent_mode: "CONTINUE_CANON" | "RETCON_REWRITE";
        target_word_count: number;
        metadata: WritingFactMetadata;
    };
    immediate_continuity: {
        recent_snapshot_refs: string[];
        open_loops: WritingContextFact[];
        carry_forward_hooks: WritingContextFact[];
    };
    current_state: {
        active_cast: WritingContextFact[];
        character_states: WritingContextFact[];
        setting_facts: WritingContextFact[];
        object_facts: WritingContextFact[];
    };
    historical_memory: {
        canon: WritingContextFact[];
        relationships: WritingContextFact[];
        timeline: WritingContextFact[];
        world: WritingContextFact[];
    };
    constraints: {
        allowed_characters: WritingContextFact[];
        valid_anchors: WritingContextFact[];
        active_objects: WritingContextFact[];
        open_threads: WritingContextFact[];
        raw_priority_a?: Record<string, unknown>;
        raw_priority_b?: Record<string, unknown>;
    };
    forbidden_reveals: {
        required: boolean;
        rules: WritingContextFact[];
        contradictory: boolean;
    };
    style_anchors: {
        facts: WritingContextFact[];
    };
    uncertainties: WritingContextUncertainty[];
    debug_source_metadata: {
        source_snapshot_ids: number[];
        evidence_refs: string[];
        used_counts_by_layer: Record<string, number>;
        dropped_counts_by_layer: Record<string, number>;
        degraded_reasons: string[];
        readiness: {
            status: WritingContextReadiness;
            reasons: string[];
        };
    };
};

export type WritingContextReadinessResult = {
    status: WritingContextReadiness;
    reasons: string[];
};
