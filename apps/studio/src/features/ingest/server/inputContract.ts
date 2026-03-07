export type InputMode = "ZIP_UPLOAD" | "MEGA_FILE" | "PASTE_TEXT";
export type SplitMode = "manual" | "auto";

export type ZipFileInput = {
  name: string;
  text: string;
};

export type MegaFileInput = {
  name?: string;
  text: string;
};

export type IngestInputPayload = {
  mode: InputMode;
  zip_files?: ZipFileInput[];
  mega_file?: MegaFileInput;
  paste_text?: {
    name?: string;
    text: string;
    chapter_no?: number | null;
  };
};

export type NormalizedChapter = {
  seq_no: number;
  chapter_no: number | null;
  source_path: string;
  text: string;
  estimated_scenes: number;
};

export type InputValidationResult = {
  ok: boolean;
  errors: string[];
  summary: {
    mode: InputMode;
    total_chapters: number;
    total_scenes_estimate: number;
  };
  chapters: NormalizedChapter[];
};

const ZIP_CHAPTER_NAME_RE = /(chapter|ch)[^0-9]*([0-9]{1,4})/i;
const MEGA_MARKER_RE = /^\s*(===\s*CHAPTER\s+([0-9]{1,4})\s*===|#\s*Chapter\s+([0-9]{1,4}))\s*$/gim;
const SCENE_HEADING_RE = /^\s*##\s*Scene\b.*$/gim;
const SCENE_DASH_RE = /^\s*---\s*$/gim;

function hasEncodingIssue(text: string): boolean {
  return text.includes("\uFFFD");
}

function readChapterNoFromName(name: string): number | null {
  const m = ZIP_CHAPTER_NAME_RE.exec(name);
  if (!m) return null;
  return Number(m[2]);
}

function normalizeChapterNo(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  if (n <= 0 || n > 9999) return null;
  return n;
}

function estimateScenesFromText(text: string): number {
  const headingCount = Array.from(text.matchAll(SCENE_HEADING_RE)).length;
  if (headingCount > 0) return headingCount;

  const dashCount = Array.from(text.matchAll(SCENE_DASH_RE)).length;
  if (dashCount > 0) return dashCount + 1;

  return 1;
}

function hasRequiredSceneDelimiter(text: string): boolean {
  const heading = /^\s*##\s*Scene\b.*$/im;
  const dash = /^\s*---\s*$/im;
  return heading.test(text) || dash.test(text);
}

function splitMegaChapters(text: string): Array<{ title: string; chapterNo: number | null; body: string }> {
  const matches = Array.from(text.matchAll(MEGA_MARKER_RE));
  if (matches.length === 0) return [];

  const out: Array<{ title: string; chapterNo: number | null; body: string }> = [];

  for (let i = 0; i < matches.length; i += 1) {
    const cur = matches[i];
    const next = matches[i + 1];
    const start = (cur.index ?? 0) + cur[0].length;
    const end = next?.index ?? text.length;
    const body = text.slice(start, end).trim();
    const chapterNoRaw = cur[2] ?? cur[3] ?? null;
    const chapterNo = chapterNoRaw ? Number(chapterNoRaw) : null;

    out.push({
      title: cur[1],
      chapterNo,
      body,
    });
  }

  return out;
}

function invalidModeResult(errors: string[], chapters: NormalizedChapter[]): InputValidationResult {
  return {
    ok: false,
    errors,
    chapters,
    summary: { mode: "ZIP_UPLOAD", total_chapters: 0, total_scenes_estimate: 0 },
  };
}

function finalizeResult(mode: InputMode, errors: string[], chapters: NormalizedChapter[]): InputValidationResult {
  const withSeq = chapters.map((c, idx) => ({ ...c, seq_no: idx + 1 }));
  const totalScenes = withSeq.reduce((sum, c) => sum + c.estimated_scenes, 0);
  return {
    ok: errors.length === 0,
    errors,
    chapters: withSeq,
    summary: {
      mode,
      total_chapters: withSeq.length,
      total_scenes_estimate: totalScenes,
    },
  };
}

function validateAndCollectZipChapter(
  file: ZipFileInput | undefined,
  seq: number,
  splitMode: SplitMode,
  errors: string[],
  chapters: NormalizedChapter[]
) {
  const name = typeof file?.name === "string" ? file.name.trim() : "";
  const text = typeof file?.text === "string" ? file.text : "";
  const chapterNo = readChapterNoFromName(name);

  const checks: Array<{ failed: boolean; code: string }> = [
    { failed: !name, code: `ZIP_FILE_NAME_MISSING_${seq}` },
    { failed: chapterNo === null, code: `ZIP_FILE_CHAPTER_NUMBER_MISSING_${seq}` },
    { failed: !text.trim(), code: `ZIP_FILE_EMPTY_${seq}` },
    { failed: hasEncodingIssue(text), code: `ZIP_FILE_ENCODING_INVALID_${seq}` },
    {
      failed: splitMode === "manual" && Boolean(text.trim()) && !hasRequiredSceneDelimiter(text),
      code: `ZIP_FILE_SCENE_DELIMITER_MISSING_${seq}`,
    },
  ];
  checks.forEach((check) => {
    if (check.failed) errors.push(check.code);
  });
  if (!name || !text.trim()) return;

  chapters.push({
    seq_no: 0,
    chapter_no: chapterNo,
    source_path: name,
    text,
    estimated_scenes: estimateScenesFromText(text),
  });
}

function validateZipUpload(payload: IngestInputPayload, splitMode: SplitMode, errors: string[], chapters: NormalizedChapter[]) {
  const files = Array.isArray(payload.zip_files) ? payload.zip_files : [];
  if (files.length === 0) errors.push("ZIP_EMPTY");

  files.forEach((file, idx) => {
    validateAndCollectZipChapter(file, idx + 1, splitMode, errors, chapters);
  });

  chapters.sort((a, b) => {
    const x = a.chapter_no ?? Number.MAX_SAFE_INTEGER;
    const y = b.chapter_no ?? Number.MAX_SAFE_INTEGER;
    if (x !== y) return x - y;
    return a.source_path.localeCompare(b.source_path);
  });
}

function validateMegaFile(payload: IngestInputPayload, splitMode: SplitMode, errors: string[], chapters: NormalizedChapter[]) {
  const megaText = typeof payload.mega_file?.text === "string" ? payload.mega_file.text : "";
  const megaName = typeof payload.mega_file?.name === "string" ? payload.mega_file.name.trim() : "mega_input.txt";

  if (!megaText.trim()) {
    errors.push("MEGA_EMPTY");
    return;
  }
  if (hasEncodingIssue(megaText)) errors.push("MEGA_ENCODING_INVALID");

  const split = splitMegaChapters(megaText);
  if (split.length === 0) errors.push("MEGA_CHAPTER_MARKER_MISSING");

  split.forEach((part, idx) => {
    const seq = idx + 1;
    if (!part.body.trim()) {
      errors.push(`MEGA_CHAPTER_EMPTY_${seq}`);
      return;
    }
    if (splitMode === "manual" && !hasRequiredSceneDelimiter(part.body)) {
      errors.push(`MEGA_SCENE_DELIMITER_MISSING_${seq}`);
    }

    chapters.push({
      seq_no: 0,
      chapter_no: part.chapterNo,
      source_path: `${megaName}#${part.title}`,
      text: part.body,
      estimated_scenes: estimateScenesFromText(part.body),
    });
  });
}

function validatePasteText(payload: IngestInputPayload, splitMode: SplitMode, errors: string[], chapters: NormalizedChapter[]) {
  const pastedText = typeof payload.paste_text?.text === "string" ? payload.paste_text.text : "";
  const pastedName =
    typeof payload.paste_text?.name === "string" && payload.paste_text.name.trim()
      ? payload.paste_text.name.trim()
      : "pasted_input.txt";
  const explicitChapterNo = normalizeChapterNo(payload.paste_text?.chapter_no);

  if (!pastedText.trim()) {
    errors.push("PASTE_TEXT_EMPTY");
    return;
  }
  if (hasEncodingIssue(pastedText)) errors.push("PASTE_TEXT_ENCODING_INVALID");

  const split = splitMegaChapters(pastedText);
  if (split.length > 0) {
    split.forEach((part, idx) => {
      const seq = idx + 1;
      if (!part.body.trim()) {
        errors.push(`PASTE_CHAPTER_EMPTY_${seq}`);
        return;
      }
      if (splitMode === "manual" && !hasRequiredSceneDelimiter(part.body)) {
        errors.push(`PASTE_SCENE_DELIMITER_MISSING_${seq}`);
      }
      chapters.push({
        seq_no: 0,
        chapter_no: part.chapterNo,
        source_path: `${pastedName}#${part.title}`,
        text: part.body,
        estimated_scenes: estimateScenesFromText(part.body),
      });
    });
    return;
  }

  if (splitMode === "manual" && !hasRequiredSceneDelimiter(pastedText)) {
    errors.push("PASTE_SCENE_DELIMITER_MISSING_1");
  }
  chapters.push({
    seq_no: 0,
    chapter_no: explicitChapterNo,
    source_path: pastedName,
    text: pastedText,
    estimated_scenes: estimateScenesFromText(pastedText),
  });
}

export function validateAndNormalizeInput(
  payload: IngestInputPayload,
  opts?: { splitMode?: SplitMode }
): InputValidationResult {
  const errors: string[] = [];
  const chapters: NormalizedChapter[] = [];
  const splitMode: SplitMode = opts?.splitMode === "auto" ? "auto" : "manual";

  if (payload.mode !== "ZIP_UPLOAD" && payload.mode !== "MEGA_FILE" && payload.mode !== "PASTE_TEXT") {
    errors.push("INVALID_MODE");
    return invalidModeResult(errors, chapters);
  }

  if (payload.mode === "ZIP_UPLOAD") {
    validateZipUpload(payload, splitMode, errors, chapters);
  } else if (payload.mode === "MEGA_FILE") {
    validateMegaFile(payload, splitMode, errors, chapters);
  } else {
    validatePasteText(payload, splitMode, errors, chapters);
  }

  return finalizeResult(payload.mode, errors, chapters);
}
