import test from "node:test";
import assert from "node:assert/strict";
import { assembleChapterWritingContext } from "./chapterWritingContextAssembler";
import type { WorkingSet } from "./chapterContextService";

function workingSet(overrides: Partial<WorkingSet> = {}): WorkingSet {
    return {
        story_id: 1,
        chapter_id: "ch02",
        snapshot_hash: "abc123",
        version: "3.0.0",
        anchor: {
            story_pitch: "N/A",
            style_dna: {
                tone: "Standard",
                pacing: "Medium",
                perspective: "Third Person Limited",
            },
            world_rules: [],
        },
        active_state: {
            cast: [
                {
                    name: "A",
                    status: "at the gate",
                    motivation: "N/A",
                    last_seen_chapter: "ch01",
                },
            ],
            world_flags: {},
            timeline_facts: [],
        },
        meso_context: {
            unresolved_loops: [{ id: "loop-1", description: "escape patrol", started_at: "ch01" }],
            milestone_summaries: ["A reached the gate."],
        },
        ephemeral: {
            recent_changes: ["A found the silver key."],
        },
        ...overrides,
    };
}

test("blocks when user intent is missing", () => {
    const result = assembleChapterWritingContext({
        workingSet: workingSet(),
        userIntent: "",
    });

    assert.equal(result.preflight.status, "blocked");
    assert.ok(result.preflight.block_reasons.includes("MISSING_CHAPTER_INTENT"));
    assert.ok(result.debug.missing_required_slots.includes("intent"));
});

test("blocks missing continuity for non-initial chapters", () => {
    const result = assembleChapterWritingContext({
        workingSet: workingSet({
            meso_context: { unresolved_loops: [], milestone_summaries: [] },
            ephemeral: { recent_changes: [] },
        }),
        userIntent: "Continue the escape.",
    });

    assert.equal(result.preflight.status, "blocked");
    assert.ok(result.preflight.block_reasons.includes("CONTINUITY_REQUIRED_BUT_MISSING"));
    assert.ok(result.debug.missing_required_slots.includes("immediate_continuity"));
});

test("marks draft-only continuity as degraded", () => {
    const result = assembleChapterWritingContext({
        workingSet: workingSet(),
        userIntent: "Continue the escape.",
        continuity: {
            source: "chapter_draft",
            refs: ["chapter_draft:10"],
            draftOnly: true,
        },
    });

    assert.equal(result.preflight.status, "degraded");
    assert.ok(result.preflight.degraded_reasons.includes("DRAFT_ONLY_CONTINUITY_USED"));
    assert.equal(result.context.immediate_continuity.carry_forward_hooks[0]?.metadata.currentness, "draft_only");
});

test("normalizes placeholder values into explicit degraded metadata", () => {
    const result = assembleChapterWritingContext({
        workingSet: workingSet(),
        userIntent: "Continue the escape.",
    });

    assert.equal(result.preflight.status, "degraded");
    assert.ok(result.preflight.degraded_reasons.includes("STORY_PITCH_UNKNOWN"));
    assert.ok(result.preflight.degraded_reasons.includes("WORLD_RULES_PARTIAL"));
    assert.ok(result.preflight.degraded_reasons.includes("CURRENT_WORLD_FLAGS_UNKNOWN"));
    assert.ok(result.preflight.degraded_reasons.includes("CHARACTER_MOTIVATION_UNKNOWN"));
});

test("populated working set raises no world/motivation uncertainties", () => {
    // Mirrors a buildWorkingSet result after #192/#196 wiring: world_rules,
    // world_flags, and per-character motivation are all populated from the DB.
    const result = assembleChapterWritingContext({
        workingSet: workingSet({
            anchor: {
                story_pitch: "A courier smuggles letters through a drowned city.",
                style_dna: {
                    tone: "Standard",
                    pacing: "Medium",
                    perspective: "Third Person Limited",
                },
                world_rules: [
                    { id: 1, content: "Tides rise at dusk: the lower district floods nightly." },
                    { id: 2, content: "Letters sealed with red wax carry legal authority." },
                ],
            },
            active_state: {
                cast: [
                    {
                        name: "A",
                        status: "at the gate",
                        motivation: "Reach the upper district before the tide.",
                        last_seen_chapter: "ch01",
                    },
                ],
                world_flags: { tide_rising: true, gate_open: false },
                timeline_facts: ["A left the harbor at dawn."],
            },
        }),
        userIntent: "Continue the escape.",
    });

    const reasons = [
        ...result.preflight.degraded_reasons,
        ...result.preflight.block_reasons,
    ];
    assert.ok(!reasons.includes("WORLD_RULES_PARTIAL"));
    assert.ok(!reasons.includes("CURRENT_WORLD_FLAGS_UNKNOWN"));
    assert.ok(!reasons.includes("CHARACTER_MOTIVATION_UNKNOWN"));
    assert.ok(!reasons.includes("STORY_PITCH_UNKNOWN"));
    assert.equal(result.preflight.status, "proceed");
});
