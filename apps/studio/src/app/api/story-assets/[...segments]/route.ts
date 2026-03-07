import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { resolveStoryAssetAbsolutePath } from "@/features/story/server/storyAssets";

export const runtime = "nodejs";

function contentTypeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ segments: string[] }> }
) {
  const { segments } = await ctx.params;
  const rel = Array.isArray(segments) ? segments.join("/") : "";
  const abs = resolveStoryAssetAbsolutePath(rel);
  if (!abs) return NextResponse.json({ error: "INVALID_PATH" }, { status: 400 });

  let buf: Buffer;
  let finalAbs: string;

  try {
    if (!abs) throw new Error("INVALID_PATH");
    buf = await readFile(abs);
    finalAbs = abs;
  } catch {
    // Fallback: try reading from public/ folder for legacy assets
    try {
      const publicAbs = resolve(process.cwd(), "public", rel.replace(/^[\\/]+/, ""));
      // Basic security check to ensure it stays within public folder
      if (!publicAbs.startsWith(resolve(process.cwd(), "public"))) {
        throw new Error("INVALID_PATH");
      }
      buf = await readFile(publicAbs);
      finalAbs = publicAbs;
    } catch {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentTypeFromExt(extname(finalAbs)),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
