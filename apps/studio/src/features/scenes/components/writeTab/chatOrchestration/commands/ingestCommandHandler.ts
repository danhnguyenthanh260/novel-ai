import { type CommandResult, workspaceHref } from "@/features/scenes/components/writeTab/chatOrchestration/commandSurfaceContracts";
import type { TimelineBlock } from "@/features/scenes/components/writeTab/types";
import type { WorkflowCommandHandlerArgs } from "@/features/scenes/components/writeTab/chatOrchestration/commands/statusCommandHandler";

type IngestValidationSummary = {
  mode?: string;
  total_chapters?: number;
  total_scenes_estimate?: number;
};

type IngestValidateResponse = {
  ok?: boolean;
  summary?: IngestValidationSummary;
  error?: string;
  errors?: string[];
};

export type IngestCommandHandlerResult = {
  block: TimelineBlock;
  result: CommandResult;
};

type SceneBoundary = {
  label: string;
  words: number | null;
};

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function compact(value: string, max = 72): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function splitTextSections(text: string): string[] {
  const sections = text
    .split(/\n\s*(?:---|##\s*Scene[^\n]*)\s*\n/iu)
    .map((item) => item.trim())
    .filter(Boolean);
  if (sections.length > 1) return sections;
  return text.split(/\n{2,}/u).map((item) => item.trim()).filter(Boolean);
}

function chunkWords(words: string[], count: number): string[] {
  const size = Math.max(1, Math.ceil(words.length / count));
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += size) {
    chunks.push(words.slice(index, index + size).join(" "));
  }
  return chunks;
}

function boundariesFromText(text: string, expectedScenes: number): SceneBoundary[] {
  const sections = splitTextSections(text);
  const words = text.trim().split(/\s+/).filter(Boolean);
  const sceneCount = Math.max(1, Math.min(6, expectedScenes || Math.ceil(words.length / 800) || 1));
  const sourceSections = sections.length >= sceneCount ? sections.slice(0, sceneCount) : chunkWords(words, sceneCount);
  return sourceSections.map((section, index) => ({
    label: `Scene boundary ${index + 1}: ${compact(section, 48) || "Untitled source section"}`,
    words: countWords(section),
  }));
}

function urlBoundaries(): SceneBoundary[] {
  return [
    { label: "Scene boundary 1: External source fetch", words: null },
    { label: "Scene boundary 2: Split approval gate", words: null },
  ];
}

function validationPreviewLine(summary: IngestValidationSummary | null, boundaries: SceneBoundary[], validationError: string | null): string {
  if (validationError) return `Validation warning: ${validationError}`;
  if (!summary) return "Validation pending until full ingest job creation.";
  return `Validated: ${summary.total_chapters ?? 1} chapter(s), ${summary.total_scenes_estimate ?? boundaries.length} scene estimate(s)`;
}

async function validatePastedText(args: WorkflowCommandHandlerArgs, text: string): Promise<IngestValidationSummary | null> {
  if (!text.trim() || isHttpUrl(text.trim())) return null;
  const form = new FormData();
  form.set("mode", "PASTE_TEXT");
  form.set("split_mode", "auto");
  form.set("self_healing_enabled", "true");
  form.set("auto_retry_enabled", "true");
  form.set("max_llm_calls", "2");
  form.set("created_by", "write_assistant");
  form.set("validate_before_split", "true");
  form.set("paste_text", text);
  form.set("paste_name", "chat_ingest_source.txt");
  const res = await fetch(`/api/${encodeURIComponent(args.storySlug)}/ingest/validate`, {
    method: "POST",
    body: form,
  });
  const json = await res.json().catch(() => ({})) as IngestValidateResponse;
  if (!res.ok || !json.ok) throw new Error(json.errors?.join(", ") || json.error || "INGEST_VALIDATE_FAILED");
  return json.summary ?? null;
}

function blockFrom(args: WorkflowCommandHandlerArgs, source: string, summary: IngestValidationSummary | null, validationError: string | null): TimelineBlock {
  const trimmed = source.trim();
  const urlInput = isHttpUrl(trimmed);
  const expectedScenes = Number(summary?.total_scenes_estimate ?? 0);
  const boundaries = urlInput ? urlBoundaries() : boundariesFromText(trimmed, expectedScenes);
  const totalWords = urlInput ? null : countWords(trimmed);
  const sourceLine = urlInput ? `Source URL: ${compact(trimmed)}` : `${totalWords?.toLocaleString() ?? 0} words ready for split review`;
  return {
    id: `ingest-artifact-${Date.now()}`,
    type: "artifact_preview",
    source: "assistant",
    artifact_id: `ingest-preview-${Date.now()}`,
    artifact_type: "source",
    title: urlInput ? "Source URL split preview" : "Source split preview",
    status: "needs_approval",
    description: "Review the proposed scene boundaries before creating a durable ingest job.",
    word_count: totalWords,
    beat_count: boundaries.length,
    preview_lines: [
      sourceLine,
      validationPreviewLine(summary, boundaries, validationError),
      ...boundaries.map((boundary) => `${boundary.label} - ${boundary.words === null ? "word count pending" : `${boundary.words.toLocaleString()} words`}`),
    ],
    actions: ["approve_splits", "reject_splits"],
    action_links: [{ label: "Open full ingest workspace", href: workspaceHref(args.storySlug, "ingest") }],
  };
}

function emptyBlock(args: WorkflowCommandHandlerArgs): TimelineBlock {
  return {
    id: `ingest-artifact-empty-${Date.now()}`,
    type: "artifact_preview",
    source: "assistant",
    artifact_id: "ingest-empty",
    artifact_type: "source",
    title: "No ingest source selected",
    status: "failed",
    description: "Attach a text file, paste source text, or provide a source URL before running ingest.",
    word_count: null,
    beat_count: null,
    preview_lines: ["No source text or URL was provided."],
    actions: [],
    action_links: [{ label: "Open full ingest workspace", href: workspaceHref(args.storySlug, "ingest") }],
  };
}

export async function runIngestCommand(args: WorkflowCommandHandlerArgs, source: string): Promise<IngestCommandHandlerResult> {
  if (!source.trim()) {
    return { block: emptyBlock(args), result: { tone: "blocked", title: "Ingest source missing", detail: "Attach a file, paste source text, or provide a URL before running /ingest." } };
  }

  let summary: IngestValidationSummary | null = null;
  let validationError: string | null = null;
  try {
    summary = await validatePastedText(args, source);
  } catch (error) {
    validationError = error instanceof Error ? error.message : "INGEST_VALIDATE_FAILED";
  }

  const block = blockFrom(args, source, summary, validationError);
  return {
    block,
    result: {
      tone: validationError ? "blocked" : "ready",
      title: "Ingest split preview ready",
      detail: validationError ? "The preview is available, but validation reported a warning." : "Review and approve the proposed split before creating a full ingest job.",
    },
  };
}

export function runIngestAction(block: Extract<TimelineBlock, { type: "artifact_preview" }>, actionId: string): TimelineBlock | null {
  if (actionId !== "approve_splits" && actionId !== "reject_splits") return null;
  const approved = actionId === "approve_splits";
  return {
    ...block,
    id: `ingest-artifact-${approved ? "approved" : "rejected"}-${Date.now()}`,
    status: approved ? "approved" : "rejected",
    description: approved ? "Split preview approved from Write chat." : "Split preview rejected from Write chat.",
    actions: [],
    preview_lines: [
      approved ? "Split preview approved. Create the durable ingest job from the full ingest workspace when ready." : "Split preview rejected. Adjust the source or boundaries before creating an ingest job.",
      ...block.preview_lines,
    ],
  };
}
