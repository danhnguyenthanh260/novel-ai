import test from "node:test";
import assert from "node:assert/strict";
import { buildWritingContextFromPlanning } from "../writingContextAdapter";

const baseInput = {
    storyId: 1,
    storySlug: "demo",
    chapterId: "ch01",
    targetWordCount: 2000,
    userPrompt: "Continue the escape.",
    writingIntentMode: "CONTINUE_CANON" as const,
    pack: {
        canonLines: ["- (fact|cf:0.90) A -> B"],
        relationshipLines: ["- A trusts B"],
        timelineLines: ["- ch01 before ch02"],
        worldCoreLines: ["- magic has a cost"],
        canonicalSettingFacts: ["city gate"],
        canonicalObjectFacts: ["silver key"],
        characterStateCards: [
            {
                entity: "A",
                role: "ACTOR",
                type: "character",
                current_state: "at the city gate",
                evidence_ids: ["canon:1"],
            },
        ],
        carryForwardHooks: ["find the key"],
        openLoops: ["escape patrol"],
        allowedCharacters: ["A"],
        sourceSnapshotIds: [10],
        memoryRuntimeV5: {
            used_counts_by_layer: { recent_structured: 1 },
            dropped_counts_by_layer: { arc: 0 },
            degraded_reasons: [],
            evidence_refs: { canon_refs: ["canon:1"], snapshot_refs: ["snap:10"] },
        },
        conflictReport: { unresolved_critical_count: 0 },
        truthContextPackV1: {
            priority_a: { ambiguity_constraints: ["protect unrevealed identity"] },
            priority_b: {},
            staleness_flags: [],
        },
    },
};

test("maps planning pack into current state and readiness", () => {
    const context = buildWritingContextFromPlanning(baseInput);
    assert.equal(context.current_state.character_states[0]?.label, "A");
    assert.equal(context.current_state.setting_facts[0]?.label, "city gate");
    assert.equal(context.debug_source_metadata.readiness.status, "proceed");
});

test("adds source metadata to high-impact facts", () => {
    const context = buildWritingContextFromPlanning(baseInput);
    const metadata = context.current_state.character_states[0]?.metadata;
    assert.equal(metadata?.source_trace.source_system, "ts_planning");
    assert.equal(metadata?.source_trace.source_function, "buildPlanningMemoryPackV5");
    assert.equal(metadata?.source_trace.chapter_id, "ch01");
    assert.equal(metadata?.currentness, "current");
});

test("does not throw when optional source data is missing", () => {
    const context = buildWritingContextFromPlanning({
        ...baseInput,
        pack: {},
    });
    assert.equal(context.intent.chapter_id, "ch01");
    assert.equal(context.debug_source_metadata.readiness.status, "degraded");
});
