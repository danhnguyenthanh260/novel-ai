export function imageSrc(path: string | null): string | null {
  if (!path) return null;
  return `/api/story-assets/${encodeURI(path)}`;
}

export async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { error: raw.slice(0, 200) };
  }
}
