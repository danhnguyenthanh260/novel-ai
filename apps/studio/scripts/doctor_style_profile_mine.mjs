import { Client } from "pg";

const DB_DSN = process.env.DATABASE_URL || process.env.DB_DSN || "postgresql://novel:novelpass@localhost:5433/novel";

function parseArgs() {
  const args = process.argv.slice(2);
  let storySlug = "";
  let lookbackDays = 3650;
  let maxDocs = 400;
  let minCharLen = 200;
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--story" && args[i + 1]) {
      storySlug = String(args[i + 1]).trim();
      i += 1;
      continue;
    }
    if (token === "--days" && args[i + 1]) {
      lookbackDays = Math.max(1, Number(args[i + 1]) || lookbackDays);
      i += 1;
      continue;
    }
    if (token === "--max-docs" && args[i + 1]) {
      maxDocs = Math.max(1, Number(args[i + 1]) || maxDocs);
      i += 1;
      continue;
    }
    if (token === "--min-char-len" && args[i + 1]) {
      minCharLen = Math.max(1, Number(args[i + 1]) || minCharLen);
      i += 1;
    }
  }
  if (!storySlug) throw new Error("Missing --story <slug>");
  return { storySlug, lookbackDays, maxDocs, minCharLen };
}

function toPct(num, den) {
  if (den <= 0) return 0;
  return Math.round((num * 10000) / den) / 100;
}

function round3(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 1000) / 1000;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

function countRe(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

function sentenceCount(paragraph) {
  const parts = paragraph
    .split(/[.!?]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length;
}

function parseParagraphs(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildStyleProfile(rawDocs) {
  const docs = rawDocs.map((row) => String(row.raw_text ?? ""));
  const mergedText = docs.join("\n");
  const totalChars = mergedText.length;
  const lines = mergedText.replace(/\r\n/g, "\n").split("\n");
  const blankLines = lines.filter((line) => line.trim().length === 0).length;
  const paragraphs = docs.flatMap((doc) => parseParagraphs(doc));
  const paragraphChars = paragraphs.map((p) => p.length);
  const paragraphSentences = paragraphs.map((p) => sentenceCount(p));
  const totalSentences = paragraphSentences.reduce((sum, n) => sum + n, 0);
  const dialogueParagraphs = paragraphs.filter((p) => /^["“”'‘’]/.test(p)).length;
  const shortParagraphs = paragraphChars.filter((n) => n < 90).length;
  const longParagraphs = paragraphChars.filter((n) => n > 320).length;

  const punctuationCounts = {
    comma: countRe(mergedText, /,/g),
    period: countRe(mergedText, /\./g),
    question: countRe(mergedText, /\?/g),
    exclamation: countRe(mergedText, /!/g),
    semicolon: countRe(mergedText, /;/g),
    colon: countRe(mergedText, /:/g),
    ellipsis: countRe(mergedText, /\.{3,}|…/g),
    dash: countRe(mergedText, /—|--/g),
  };

  const per1k = {};
  for (const [k, v] of Object.entries(punctuationCounts)) {
    per1k[k] = totalChars > 0 ? round3((v * 1000) / totalChars) : 0;
  }

  const words = mergedText
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/g)
    .map((w) => w.trim())
    .filter(Boolean);
  const avgWordsPerSentence = totalSentences > 0 ? words.length / totalSentences : 0;

  return {
    schema_version: "v1",
    generated_at: new Date().toISOString(),
    corpus: {
      doc_count: rawDocs.length,
      total_chars: totalChars,
      total_lines: lines.length,
      blank_line_ratio: toPct(blankLines, Math.max(lines.length, 1)),
      total_paragraphs: paragraphs.length,
      total_sentences: totalSentences,
    },
    paragraph: {
      avg_chars: round3(paragraphChars.reduce((sum, n) => sum + n, 0) / Math.max(paragraphChars.length, 1)),
      p50_chars: percentile(paragraphChars, 50),
      p90_chars: percentile(paragraphChars, 90),
      avg_sentences: round3(paragraphSentences.reduce((sum, n) => sum + n, 0) / Math.max(paragraphSentences.length, 1)),
      p50_sentences: percentile(paragraphSentences, 50),
      p90_sentences: percentile(paragraphSentences, 90),
      short_paragraph_ratio: toPct(shortParagraphs, Math.max(paragraphs.length, 1)),
      long_paragraph_ratio: toPct(longParagraphs, Math.max(paragraphs.length, 1)),
    },
    dialogue: {
      dialogue_paragraph_ratio: toPct(dialogueParagraphs, Math.max(paragraphs.length, 1)),
      straight_double_quote_count: countRe(mergedText, /"/g),
      curly_double_quote_count: countRe(mergedText, /[“”]/g),
      curly_single_quote_count: countRe(mergedText, /[‘’]/g),
    },
    sentences: {
      avg_words_per_sentence: round3(avgWordsPerSentence),
    },
    punctuation_per_1k: per1k,
  };
}

function buildSample(rawDocs) {
  const samples = rawDocs
    .slice(0, 3)
    .map((row) => {
      const text = String(row.raw_text ?? "").replace(/\s+/g, " ").trim();
      return {
        source_doc_id: row.id,
        chapter_id: row.chapter_id || null,
        char_len: Number(row.char_len || 0),
        excerpt: text.slice(0, 240),
      };
    });
  return {
    source: "source_doc.ingest_chapter",
    sample_docs: samples,
  };
}

async function resolveStoryId(db, slug) {
  const res = await db.query(
    `SELECT id
     FROM public.story_series
     WHERE slug = $1
     LIMIT 1`,
    [slug]
  );
  const id = Number(res.rows[0]?.id ?? 0);
  if (!id) throw new Error("STORY_NOT_FOUND");
  return id;
}

async function loadDocs(db, storyId, args) {
  const res = await db.query(
    `SELECT
       id::text AS id,
       raw_text,
       char_len,
       COALESCE(origin->>'chapter_id', origin->>'chapter_slug', '') AS chapter_id
     FROM public.source_doc
     WHERE story_id = $1
       AND doc_type = 'ingest_chapter'
       AND char_len >= $2
       AND created_at >= now() - ($3::text || ' days')::interval
     ORDER BY created_at DESC
     LIMIT $4`,
    [storyId, args.minCharLen, String(args.lookbackDays), args.maxDocs]
  );
  return res.rows;
}

async function main() {
  const args = parseArgs();
  const db = new Client({ connectionString: DB_DSN });
  await db.connect();
  try {
    const storyId = await resolveStoryId(db, args.storySlug);
    const docs = await loadDocs(db, storyId, args);
    if (!docs.length) throw new Error("NO_INGEST_SOURCE_DOC_FOUND");
    const profile = buildStyleProfile(docs);
    const sample = buildSample(docs);
    await db.query(
      `INSERT INTO public.author_style_profile (story_id, profile_json, sample_json)
       VALUES ($1, $2::jsonb, $3::jsonb)
       ON CONFLICT (story_id) DO UPDATE SET
         profile_json = EXCLUDED.profile_json,
         sample_json = EXCLUDED.sample_json,
         updated_at = now()`,
      [storyId, JSON.stringify(profile), JSON.stringify(sample)]
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          story_slug: args.storySlug,
          story_id: storyId,
          docs_used: docs.length,
          days: args.lookbackDays,
          max_docs: args.maxDocs,
          min_char_len: args.minCharLen,
          profile,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error("[doctor-style-profile-mine] FAIL", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();
