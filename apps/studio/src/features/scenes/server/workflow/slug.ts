export type SlugKey = { chapterId: number; idx: number };

const SLUG_RE = /^ch(-?\d+)_s(\d+)$/;

export function makeSlug(chapterId: number, idx: number): string {
  return `ch${chapterId}_s${idx}`;
}

export function parseSlug(slug: string): SlugKey {
  const s = slug.trim();
  const m = SLUG_RE.exec(s);
  if (!m) {
    throw new Error(`Slug không hợp lệ: ${slug} (kỳ vọng dạng ch<chapter>_s<scene>, vd ch0_s1)`);
  }
  return { chapterId: Number(m[1]), idx: Number(m[2]) };
}
