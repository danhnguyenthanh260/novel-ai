import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { getStoryBySlug, updateStoryBySlug, type StoryStatus } from "@/features/scenes/server/workflow/repoStory";
import { getStoryPublicDetailBySlug, getStoryMetaBySlug, patchStoryMetaBySlug, type LibraryStatus } from "@/features/story/server/libraryRepo";

const STATUS_SET = new Set<StoryStatus>(["ACTIVE", "ARCHIVED", "DRAFT"]);
const LIBRARY_STATUS = new Set<LibraryStatus>(["draft", "published", "archived", "private"]);

type StoryPatch = {
  title?: string;
  status?: StoryStatus;
  systemPrompt?: string | null;
  toneProfileJson?: Record<string, unknown>;
  defaultLlmParamsJson?: Record<string, unknown>;
  settingsJson?: Record<string, unknown>;
};

type StoryMetaPatch = {
  title?: string;
  library_status?: LibraryStatus;
  description_md?: string | null;
  author_note_md?: string | null;
  summary_md?: string | null;
  caution_other_md?: string | null;
  background_image_path?: string | null;
  tags?: string[];
  cautions?: string[];
};

function badRequest(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 });
}

function asObjectOrUndefined(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function readStringOrNull(v: unknown): string | null {
  if (v === null) return null;
  if (typeof v !== "string") return null;
  const x = v.trim();
  return x.length > 0 ? x : null;
}

function readStringArray(v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return undefined;
  return v.map((x) => String(x ?? "")).filter((x) => x.trim().length > 0);
}

function parseStoryStatus(raw: unknown): StoryStatus | undefined {
  const status = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return STATUS_SET.has(status as StoryStatus) ? (status as StoryStatus) : undefined;
}

function parseLibraryStatus(raw: unknown): LibraryStatus | undefined {
  const value = String(raw ?? "").toLowerCase() as LibraryStatus;
  return LIBRARY_STATUS.has(value) ? value : undefined;
}

function applyStoryTitlePatch(body: Record<string, unknown>, patch: StoryPatch): string | null {
  if (body.title === undefined) return null;
  if (typeof body.title !== "string" || !body.title.trim()) return "INVALID_TITLE";
  patch.title = body.title.trim();
  return null;
}

function applyStoryStatusPatch(body: Record<string, unknown>, patch: StoryPatch): string | null {
  if (body.status === undefined) return null;
  const status = parseStoryStatus(body.status);
  if (!status) return "INVALID_STATUS";
  patch.status = status;
  return null;
}

function applySystemPromptPatch(body: Record<string, unknown>, patch: StoryPatch): string | null {
  if (body.system_prompt === undefined) return null;
  if (body.system_prompt !== null && typeof body.system_prompt !== "string") return "INVALID_SYSTEM_PROMPT";
  patch.systemPrompt = body.system_prompt as string | null;
  return null;
}

function applyToneProfilePatch(body: Record<string, unknown>, patch: StoryPatch): string | null {
  if (body.tone_profile_json === undefined) return null;
  const tone = asObjectOrUndefined(body.tone_profile_json);
  if (tone === undefined) return "INVALID_TONE_PROFILE_JSON";
  patch.toneProfileJson = tone;
  return null;
}

function applyDefaultLlmParamsPatch(body: Record<string, unknown>, patch: StoryPatch): string | null {
  if (body.default_llm_params_json === undefined) return null;
  const llm = asObjectOrUndefined(body.default_llm_params_json);
  if (llm === undefined) return "INVALID_DEFAULT_LLM_PARAMS_JSON";
  patch.defaultLlmParamsJson = llm;
  return null;
}

function applySettingsPatch(body: Record<string, unknown>, patch: StoryPatch): string | null {
  if (body.settings_json === undefined) return null;
  const settings = asObjectOrUndefined(body.settings_json);
  if (settings === undefined) return "INVALID_SETTINGS_JSON";
  patch.settingsJson = settings;
  return null;
}

function applyMetaTitlePatch(body: Record<string, unknown>, patch: StoryMetaPatch): string | null {
  if (body.title === undefined) return null;
  if (typeof body.title !== "string" || !body.title.trim()) return "INVALID_TITLE";
  patch.title = body.title.trim();
  return null;
}

function applyMetaLibraryStatusPatch(body: Record<string, unknown>, patch: StoryMetaPatch): string | null {
  if (body.library_status === undefined) return null;
  const status = parseLibraryStatus(body.library_status);
  if (!status) return "INVALID_LIBRARY_STATUS";
  patch.library_status = status;
  return null;
}

function applyMetaTagsPatch(body: Record<string, unknown>, patch: StoryMetaPatch): string | null {
  if (body.tags === undefined) return null;
  const tags = readStringArray(body.tags);
  if (!tags) return "INVALID_TAGS";
  patch.tags = tags;
  return null;
}

function applyMetaCautionsPatch(body: Record<string, unknown>, patch: StoryMetaPatch): string | null {
  if (body.cautions === undefined) return null;
  const cautions = readStringArray(body.cautions);
  if (!cautions) return "INVALID_CAUTIONS";
  patch.cautions = cautions;
  return null;
}

function parseStoryPatch(body: Record<string, unknown>): { patch: StoryPatch } | { response: NextResponse } {
  const patch: StoryPatch = {};
  const validators = [
    applyStoryTitlePatch(body, patch),
    applyStoryStatusPatch(body, patch),
    applySystemPromptPatch(body, patch),
    applyToneProfilePatch(body, patch),
    applyDefaultLlmParamsPatch(body, patch),
    applySettingsPatch(body, patch),
  ];
  const error = validators.find((x) => Boolean(x));
  if (error) return { response: badRequest(error) };

  return { patch };
}

function parseStoryMetaPatch(body: Record<string, unknown>): { patch: StoryMetaPatch } | { response: NextResponse } {
  const patch: StoryMetaPatch = {};
  const validators = [
    applyMetaTitlePatch(body, patch),
    applyMetaLibraryStatusPatch(body, patch),
  ];
  const error = validators.find((x) => Boolean(x));
  if (error) return { response: badRequest(error) };

  if (body.description_md !== undefined) patch.description_md = readStringOrNull(body.description_md);
  if (body.author_note_md !== undefined) patch.author_note_md = readStringOrNull(body.author_note_md);
  if (body.summary_md !== undefined) patch.summary_md = readStringOrNull(body.summary_md);
  if (body.caution_other_md !== undefined) patch.caution_other_md = readStringOrNull(body.caution_other_md);
  if (body.background_image_path !== undefined) patch.background_image_path = readStringOrNull(body.background_image_path);
  const listErrors = [applyMetaTagsPatch(body, patch), applyMetaCautionsPatch(body, patch)];
  const listError = listErrors.find((x) => Boolean(x));
  if (listError) return { response: badRequest(listError) };

  return { patch };
}

export async function getStoryBySlugResponse(slug: string): Promise<NextResponse> {
  const item = await getStoryBySlug(pool, slug);
  if (!item) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function patchStoryBySlugResponse(req: NextRequest, slug: string): Promise<NextResponse> {
  const body = (await req.json()) as Record<string, unknown>;
  const parsed = parseStoryPatch(body);
  if ("response" in parsed) return parsed.response;

  const patch = parsed.patch;
  const item = await updateStoryBySlug(pool, slug, patch);
  if (!item) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function getStoryPublicBySlugResponse(slug: string): Promise<NextResponse> {
  const item = await getStoryPublicDetailBySlug(pool, slug);
  if (!item) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, item });
}

export async function getStoryMetaBySlugResponse(slug: string): Promise<NextResponse> {
  const item = await getStoryMetaBySlug(pool, slug);
  if (!item) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, item });
}

export async function patchStoryMetaBySlugResponse(req: NextRequest, slug: string): Promise<NextResponse> {
  const body = (await req.json()) as Record<string, unknown>;
  const parsed = parseStoryMetaPatch(body);
  if ("response" in parsed) return parsed.response;

  const patch = parsed.patch;
  const item = await patchStoryMetaBySlug(pool, slug, patch);
  if (!item) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, item });
}
