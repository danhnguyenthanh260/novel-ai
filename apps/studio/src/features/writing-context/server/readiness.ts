import type { WritingContext, WritingContextReadinessResult } from "./types";

function hasText(value: string | undefined): boolean {
    return Boolean(value && value.trim().length > 0);
}

export function evaluateWritingContextReadiness(context: WritingContext): WritingContextReadinessResult {
    const blockingReasons: string[] = [];
    const degradedReasons: string[] = [];

    if (!hasText(context.intent.chapter_id)) {
        blockingReasons.push("MISSING_CHAPTER_ID");
    }
    if (!hasText(context.intent.chapter_goal)) {
        blockingReasons.push("MISSING_CHAPTER_INTENT");
    }
    if (context.forbidden_reveals.contradictory) {
        blockingReasons.push("FORBIDDEN_REVEALS_CONTRADICTORY");
    }
    if (context.forbidden_reveals.required && context.forbidden_reveals.rules.length === 0) {
        blockingReasons.push("FORBIDDEN_REVEALS_REQUIRED_BUT_MISSING");
    }

    const hasImmediateContinuity =
        context.immediate_continuity.recent_snapshot_refs.length > 0 ||
        context.immediate_continuity.open_loops.length > 0 ||
        context.immediate_continuity.carry_forward_hooks.length > 0;
    if (!hasImmediateContinuity) {
        degradedReasons.push("IMMEDIATE_CONTINUITY_PARTIAL");
    }
    if (context.current_state.active_cast.length === 0 || context.current_state.character_states.length === 0) {
        degradedReasons.push("CURRENT_ACTIVE_CAST_STATE_MISSING");
    }
    for (const uncertainty of context.uncertainties) {
        if (uncertainty.severity === "blocking") {
            blockingReasons.push(uncertainty.code);
        } else if (uncertainty.severity === "warning") {
            degradedReasons.push(uncertainty.code);
        }
    }

    if (blockingReasons.length > 0) {
        return { status: "blocked", reasons: Array.from(new Set(blockingReasons)) };
    }
    if (degradedReasons.length > 0) {
        return { status: "degraded", reasons: Array.from(new Set(degradedReasons)) };
    }
    return { status: "proceed", reasons: [] };
}
