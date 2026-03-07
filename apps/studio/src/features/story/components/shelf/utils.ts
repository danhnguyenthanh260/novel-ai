export function coverSrc(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("/")) return path;
  return `/api/story-assets/${encodeURI(path)}`;
}
