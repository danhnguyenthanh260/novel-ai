import test from "node:test";
import assert from "node:assert/strict";
import { evaluateWritingContextReadiness } from "../readiness";
import type { WritingContext, WritingFactMetadata } from "../types";

const meta: WritingFactMetadata = {
    source_trace: {
        source_system: "ts_planning",
        source_function: "test",
        chapter_id: "ch01",
    },
    confidence: 1,
    currentness: "current",
    conflict_status: "clean",
};

function baseContext(): WritingContext {
    return {
        contract_version: "writing_context_v1",
        intent: {
            story_id: 1,
            chapter_id: "ch01",
            chapter_goal: "Write the next chapter.",
            writing_intent_mode: "CONTINUE_CANON",
            target_word_count: 2000,
            metadata: meta,
        },
        immediate_continuity: {
            recent_snapshot_refs: ["snap:1"],
            open_loops: [],
            carry_forward_hooks: [],
        },
        current_state: {
            active_cast: [{ kind: "allowed_character", label: "A", metadata: meta }],
            character_states: [{ kind: "character_state", label: "A", value: "present", metadata: meta }],
            setting_facts: [],
            object_facts: [],
        },
        historical_memory: { canon: [], relationships: [], timeline: [], world: [] },
        constraints: { allowed_characters: [], valid_anchors: [], active_objects: [], open_threads: [] },
        forbidden_reveals: { required: false, rules: [], contradictory: false },
        style_anchors: { facts: [] },
        uncertainties: [],
        debug_source_metadata: {
            source_snapshot_ids: [1],
            evidence_refs: [],
            used_counts_by_layer: {},
            dropped_counts_by_layer: {},
            degraded_reasons: [],
            readiness: { status: "proceed", reasons: [] },
        },
    };
}

test("blocks when chapter intent is missing", () => {
    const context = baseContext();
    context.intent.chapter_goal = "";
    assert.deepEqual(evaluateWritingContextReadiness(context), {
        status: "blocked",
        reasons: ["MISSING_CHAPTER_INTENT"],
    });
});

test("degrades when active cast state is missing but writing can continue", () => {
    const context = baseContext();
    context.current_state.character_states = [];
    assert.deepEqual(evaluateWritingContextReadiness(context), {
        status: "degraded",
        reasons: ["CURRENT_ACTIVE_CAST_STATE_MISSING"],
    });
});

test("proceeds when required context is present", () => {
    assert.deepEqual(evaluateWritingContextReadiness(baseContext()), {
        status: "proceed",
        reasons: [],
    });
});
