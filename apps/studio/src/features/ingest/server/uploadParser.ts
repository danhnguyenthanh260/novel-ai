import { unzipSync } from "fflate";
import type { IngestInputPayload, InputMode, SplitMode } from "./inputContract";

type ParsedIngestRequest = {
  payload: IngestInputPayload;
  createdBy?: string;
  reviewMode?: string;
  splitMode?: SplitMode;
  selfHealingEnabled?: boolean;
  autoRetryEnabled?: boolean;
  maxLlmCalls?: number;
  validateBeforeSplit?: boolean;
};

type ParsedOptions = Omit<ParsedIngestRequest, "payload">;

function decodeUtf8Strict(bytes: Uint8Array, errorCode: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(errorCode);
  }
}

function parseMode(raw: unknown): InputMode {
  const mode = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (mode === "ZIP_UPLOAD" || mode === "MEGA_FILE" || mode === "PASTE_TEXT") return mode;
  throw new Error("INVALID_MODE");
}

function getOptionalText(form: FormData, key: string): string | undefined {
  const val = form.get(key);
  if (typeof val !== "string") return undefined;
  const s = val.trim();
  return s ? s : undefined;
}

function parseBoolLike(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return fallback;
}

function parseMaxLlmCalls(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(5, Math.max(1, Math.floor(n)));
}

function parseOptionalChapterNo(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const v = Math.floor(n);
  if (v <= 0 || v > 9999) return null;
  return v;
}

function parseSplitMode(raw: string | undefined): SplitMode | undefined {
  return raw === "auto" || raw === "manual" ? raw : undefined;
}

function normalizeOptionalJsonText(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const text = raw.trim();
  return text ? text : undefined;
}

function parseMaxLlmCallsFromUnknown(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(5, Math.max(1, Math.floor(n)));
}

function parseOptionsFromForm(form: FormData): ParsedOptions {
  return {
    createdBy: getOptionalText(form, "created_by"),
    reviewMode: getOptionalText(form, "review_mode"),
    splitMode: parseSplitMode(getOptionalText(form, "split_mode")),
    selfHealingEnabled: parseBoolLike(getOptionalText(form, "self_healing_enabled"), true),
    autoRetryEnabled: parseBoolLike(getOptionalText(form, "auto_retry_enabled"), true),
    maxLlmCalls: parseMaxLlmCalls(getOptionalText(form, "max_llm_calls"), 5),
    validateBeforeSplit: parseBoolLike(getOptionalText(form, "validate_before_split"), false),
  };
}

function parseOptionsFromJson(body: {
  created_by?: unknown;
  review_mode?: unknown;
  split_mode?: unknown;
  self_healing_enabled?: unknown;
  auto_retry_enabled?: unknown;
  max_llm_calls?: unknown;
  validate_before_split?: unknown;
}): ParsedOptions {
  return {
    createdBy: normalizeOptionalJsonText(body.created_by),
    reviewMode: normalizeOptionalJsonText(body.review_mode),
    splitMode: parseSplitMode(typeof body.split_mode === "string" ? body.split_mode : undefined),
    selfHealingEnabled: typeof body.self_healing_enabled === "boolean" ? body.self_healing_enabled : true,
    autoRetryEnabled: typeof body.auto_retry_enabled === "boolean" ? body.auto_retry_enabled : true,
    maxLlmCalls: parseMaxLlmCallsFromUnknown(body.max_llm_calls, 5),
    validateBeforeSplit: typeof body.validate_before_split === "boolean" ? body.validate_before_split : false,
  };
}

function withOptions(payload: IngestInputPayload, options: ParsedOptions): ParsedIngestRequest {
  return {
    payload,
    ...options,
  };
}

async function parseZipPayload(form: FormData): Promise<IngestInputPayload> {
  const zip = form.get("zip_file");
  if (!(zip instanceof File)) throw new Error("ZIP_FILE_MISSING");

  const bytes = new Uint8Array(await zip.arrayBuffer());
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("ZIP_DECOMPRESS_FAILED");
  }

  const zipFiles: Array<{ name: string; text: string }> = [];
  for (const [name, content] of Object.entries(files)) {
    if (!name || name.endsWith("/")) continue;
    const text = decodeUtf8Strict(content, `ZIP_FILE_ENCODING_INVALID_${zipFiles.length + 1}`);
    zipFiles.push({ name, text });
  }

  if (zipFiles.length === 0) throw new Error("ZIP_EMPTY");
  return { mode: "ZIP_UPLOAD", zip_files: zipFiles };
}

async function parseMegaPayload(form: FormData): Promise<IngestInputPayload> {
  const mega = form.get("mega_file");
  if (!(mega instanceof File)) throw new Error("MEGA_FILE_MISSING");
  const text = decodeUtf8Strict(new Uint8Array(await mega.arrayBuffer()), "MEGA_ENCODING_INVALID");
  return {
    mode: "MEGA_FILE",
    mega_file: {
      name: mega.name || "mega_input.txt",
      text,
    },
  };
}

function parsePastePayload(form: FormData): IngestInputPayload {
  const pastedText = getOptionalText(form, "paste_text");
  const pastedName = getOptionalText(form, "paste_name") || "pasted_input.txt";
  const pastedChapterNo = parseOptionalChapterNo(getOptionalText(form, "paste_chapter_no"));
  if (!pastedText) throw new Error("PASTE_TEXT_MISSING");
  return {
    mode: "PASTE_TEXT",
    paste_text: {
      name: pastedName,
      text: pastedText,
      chapter_no: pastedChapterNo,
    },
  };
}

async function parseMultipart(form: FormData): Promise<ParsedIngestRequest> {
  const mode = parseMode(form.get("mode"));
  const options = parseOptionsFromForm(form);
  if (mode === "ZIP_UPLOAD") return withOptions(await parseZipPayload(form), options);
  if (mode === "MEGA_FILE") return withOptions(await parseMegaPayload(form), options);
  return withOptions(parsePastePayload(form), options);
}

type JsonIngestRequestBody = IngestInputPayload & {
  created_by?: string;
  review_mode?: string;
  split_mode?: string;
  self_healing_enabled?: boolean;
  auto_retry_enabled?: boolean;
  max_llm_calls?: number;
  validate_before_split?: boolean;
};

function parseJsonIngestRequest(body: JsonIngestRequestBody): ParsedIngestRequest {
  return withOptions(body, parseOptionsFromJson(body));
}

export async function parseIngestRequest(req: Request): Promise<ParsedIngestRequest> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    const form = await req.formData();
    return parseMultipart(form);
  }

  const body = (await req.json()) as JsonIngestRequestBody;
  return parseJsonIngestRequest(body);
}
