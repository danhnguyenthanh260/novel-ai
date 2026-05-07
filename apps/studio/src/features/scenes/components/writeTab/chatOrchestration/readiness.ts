import type {
  AssistantReadinessBriefing,
  AssistantReadinessContext,
  AssistantReadinessItem,
  AssistantReadinessStatus,
  RecoveryChip,
} from "@/features/scenes/components/writeTab/types";

function item(label: string, state: AssistantReadinessItem["state"]): AssistantReadinessItem {
  return { label, state };
}

function storyTitle(context: AssistantReadinessContext): string {
  return context.storyTitle?.trim() || "Current story";
}

function chapterLabel(context: AssistantReadinessContext): string {
  if (!context.chapterId) return "No chapter selected";
  if (context.chapterTitle?.trim()) return `${context.chapterId} - ${context.chapterTitle.trim()}`;
  return context.chapterId;
}

function statusFromContext(context: AssistantReadinessContext): AssistantReadinessStatus {
  if (!context.storySelected || !context.chapterId) return "blocked";
  if (!context.availability.has_chapter_intent || !context.availability.has_active_characters) return "blocked";
  if (context.readiness === "blocked") return "blocked";
  if (context.readiness === "degraded") return "degraded";
  if (!context.availability.has_source_chapters || !context.availability.has_immediate_continuity || !context.availability.has_style_profile) {
    return "degraded";
  }
  return "ready";
}

function blockedWriteReason(context: AssistantReadinessContext): string | null {
  if (!context.storySelected) return "No story is selected. I need to know which story we're working on.";
  if (!context.chapterId) return "No chapter is selected. Which chapter are we working on?";
  if (!context.availability.has_chapter_intent) return "I don't know what this chapter needs to accomplish yet.";
  if (!context.availability.has_active_characters) return "I don't have enough character data for this chapter's plan.";
  if (context.readiness === "blocked") return "The chapter context is blocked. Inspect the context or add missing material before writing.";
  return null;
}

function recoveryChips(context: AssistantReadinessContext, status: AssistantReadinessStatus): RecoveryChip[] {
  if (!context.storySelected) {
    return [
      { label: "Browse existing stories", intent: "browse_stories" },
      { label: "Start a new story", intent: "start_story" },
      { label: "Tell me what you want to work on", intent: "describe_goal" },
    ];
  }
  if (!context.chapterId) {
    return [
      { label: "Choose chapter", intent: "switch_story" },
      { label: "Add missing context", intent: "add_context" },
      { label: "Inspect context", intent: "inspect_context" },
    ];
  }
  if (status === "blocked") {
    return [
      { label: "Add missing context", intent: "add_context" },
      { label: "Analyze source first", intent: "analyze_source" },
      { label: "Inspect context", intent: "inspect_context" },
      { label: "Switch story", intent: "switch_story" },
    ];
  }
  if (status === "degraded") {
    return [
      { label: "Continue with caveat", intent: "continue_degraded" },
      { label: "Analyze source first", intent: "analyze_source" },
      { label: "Inspect context", intent: "inspect_context" },
    ];
  }
  return [
    { label: "Write chapter", intent: "continue_degraded" },
    { label: "Inspect context", intent: "inspect_context" },
  ];
}

function summary(context: AssistantReadinessContext, status: AssistantReadinessStatus, writeBlocker: string | null): string {
  if (writeBlocker) return writeBlocker;
  if (status === "degraded") return "I can help, but output quality may be reduced until the missing context is refreshed.";
  return "The chapter has enough context for the next writing action.";
}

export function buildAssistantReadiness(context: AssistantReadinessContext): AssistantReadinessBriefing {
  const status = statusFromContext(context);
  const writeBlocker = blockedWriteReason(context);
  const items: AssistantReadinessItem[] = [
    item("Story selected", context.storySelected ? "ok" : "missing"),
    item("Chapter selected", context.chapterId ? "ok" : "missing"),
    item("Chapter intent", context.availability.has_chapter_intent ? "ok" : "missing"),
    item("Active characters", context.availability.has_active_characters ? "ok" : "missing"),
    item("Source material", context.availability.has_source_chapters ? "ok" : "missing"),
    item("Memory snapshot", context.availability.has_memory_snapshot ? "ok" : "partial"),
    item("Style profile", context.availability.has_style_profile ? "ok" : "partial"),
    item("Immediate continuity", context.availability.has_immediate_continuity ? "ok" : "partial"),
  ];

  return {
    status,
    title: context.storySelected ? `${storyTitle(context)} / ${chapterLabel(context)}` : "No story selected",
    summary: summary(context, status, writeBlocker),
    items,
    chips: recoveryChips(context, status),
    canWrite: !writeBlocker,
    blockedWriteReason: writeBlocker,
  };
}
