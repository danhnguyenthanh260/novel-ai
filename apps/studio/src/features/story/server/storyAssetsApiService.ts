import { NextRequest, NextResponse } from "next/server";
import {
  deleteStoryImageById,
  getStoryIdBySlug,
  getStoryMetaBySlug,
  insertStoryGalleryImage,
  setStoryBackgroundImagePath,
  setStoryCoverImagePath,
} from "@/features/story/server/libraryRepo";
import { pool } from "@/server/db/pool";
import { removeStoryAssetByRelativePath, saveStoryAsset } from "@/features/story/server/storyAssets";

export async function postGalleryAssetResponse(req: NextRequest, slug: string): Promise<NextResponse> {
  const storyId = await getStoryIdBySlug(pool, slug);
  if (!storyId) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const form = await req.formData();
  const files = [
    ...form.getAll("files"),
    ...form.getAll("gallery_files"),
  ].filter((x): x is File => x instanceof File);

  if (files.length === 0) return NextResponse.json({ error: "FILES_REQUIRED" }, { status: 400 });

  const created: Array<{ id: number; path: string }> = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length === 0) continue;

    const saved = await saveStoryAsset({
      storySlug: slug,
      kind: "gallery",
      fileName: file.name || `gallery_${i + 1}`,
      mimeType: file.type || "",
      bytes,
    });
    const id = await insertStoryGalleryImage(pool, {
      storyId,
      path: saved.relativePath,
      sortOrder: i,
    });
    created.push({ id, path: saved.relativePath });
  }

  return NextResponse.json({ ok: true, created });
}

export async function postCoverAssetResponse(req: NextRequest, slug: string): Promise<NextResponse> {
  const storyId = await getStoryIdBySlug(pool, slug);
  if (!storyId) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const form = await req.formData();
  const file = (form.get("file") ?? form.get("cover_file")) as File | null;
  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) return NextResponse.json({ error: "FILE_EMPTY" }, { status: 400 });

  const prev = await getStoryMetaBySlug(pool, slug);
  const saved = await saveStoryAsset({
    storySlug: slug,
    kind: "cover",
    fileName: file.name || "cover",
    mimeType: file.type || "",
    bytes,
  });

  await setStoryCoverImagePath(pool, storyId, saved.relativePath);

  if (prev?.cover_image_path && prev.cover_image_path !== saved.relativePath) {
    await removeStoryAssetByRelativePath(prev.cover_image_path);
  }

  return NextResponse.json({ ok: true, cover_image_path: saved.relativePath });
}

export async function postBackgroundAssetResponse(req: NextRequest, slug: string): Promise<NextResponse> {
  const storyId = await getStoryIdBySlug(pool, slug);
  if (!storyId) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const form = await req.formData();
  const file = (form.get("file") ?? form.get("background_file")) as File | null;
  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) return NextResponse.json({ error: "FILE_EMPTY" }, { status: 400 });

  const prev = await getStoryMetaBySlug(pool, slug);
  const saved = await saveStoryAsset({
    storySlug: slug,
    kind: "background",
    fileName: file.name || "background",
    mimeType: file.type || "",
    bytes,
  });

  await setStoryBackgroundImagePath(pool, storyId, saved.relativePath);

  if (prev?.background_image_path && prev.background_image_path !== saved.relativePath) {
    await removeStoryAssetByRelativePath(prev.background_image_path);
  }

  return NextResponse.json({ ok: true, background_image_path: saved.relativePath });
}

export async function deleteStoryImageAssetResponse(slug: string, imageId: string): Promise<NextResponse> {
  const storyId = await getStoryIdBySlug(pool, slug);
  if (!storyId) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const id = Number(imageId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "INVALID_IMAGE_ID" }, { status: 400 });
  }

  const deleted = await deleteStoryImageById(pool, { storyId, imageId: id });
  if (!deleted) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (deleted.path) await removeStoryAssetByRelativePath(deleted.path);
  return NextResponse.json({ ok: true });
}
