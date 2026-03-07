export function buildDraftKey(storySlug: string, sceneIdRaw: string): string {
  const scenePart = sceneIdRaw ? `scene:${sceneIdRaw}` : "story";
  return `muse_report_draft:v1:${storySlug}:${scenePart}`;
}

export function toSnippet(raw: string): string {
  const compact = raw.replace(/\s+/g, " ").trim();
  if (compact.length <= 180) return compact;
  return `${compact.slice(0, 177)}...`;
}
