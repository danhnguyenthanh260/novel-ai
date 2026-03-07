import { mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

function sanitizeSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
}

function inferExt(fileName: string, mimeType: string): string {
  const ext = extname(fileName || "").toLowerCase();
  if (ext && ext.length <= 8) return ext;
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("webp")) return ".webp";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return ".jpg";
  if (mimeType.includes("gif")) return ".gif";
  return ".bin";
}

export function storageRoot(): string {
  const env = process.env.STORY_ASSET_ROOT?.trim();
  if (env) return env;
  return resolve(process.cwd(), "../storage");
}

export function resolveStoryAssetAbsolutePath(relativePath: string): string | null {
  const safe = relativePath.replace(/^[\\/]+/, "");
  if (!safe || safe.includes("\0")) return null;
  const root = storageRoot();
  const abs = normalize(join(root, safe));
  if (!abs.startsWith(root)) return null;
  return abs;
}

export async function saveStoryAsset(args: {
  storySlug: string;
  kind: "cover" | "gallery" | "background";
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<{ relativePath: string; absolutePath: string }> {
  const slug = sanitizeSlug(args.storySlug);
  const folder = args.kind === "cover" ? "covers" : args.kind === "background" ? "backgrounds" : "gallery";
  const ext = inferExt(args.fileName, args.mimeType);
  const name = `${crypto.randomUUID()}${ext}`;
  const relativePath = `${folder}/${slug}/${name}`;
  const absolutePath = join(storageRoot(), relativePath);

  await mkdir(join(storageRoot(), folder, slug), { recursive: true });
  await writeFile(absolutePath, args.bytes);
  return { relativePath, absolutePath };
}

export async function removeStoryAssetByRelativePath(relativePath: string): Promise<void> {
  const absolutePath = resolveStoryAssetAbsolutePath(relativePath);
  if (!absolutePath) return;
  try {
    await unlink(absolutePath);
  } catch {
    // File may already be missing, keep DB as source of truth.
  }
}
