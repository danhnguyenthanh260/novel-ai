export function getScenesApiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function getScenesApiStatusFromMessage(message: string): number {
  if (message.includes("LOCKED") || message.includes("STORY_ARCHIVED")) return 409;
  if (message.includes("NOT_FOUND")) return 404;
  return 400;
}
