import { NextResponse } from "next/server";

const DEFAULT_SCENES_ALIAS = "/api/scenes/*";
const CANONICAL_SCENES_ROUTE = "/api/[storySlug]/scenes/*";
const SUNSET_HTTP_DATE = "Sun, 07 Jun 2026 00:00:00 GMT";

export function withDefaultScenesAliasDeprecation(response: NextResponse): NextResponse {
  response.headers.set("Deprecation", "true");
  response.headers.set("Sunset", SUNSET_HTTP_DATE);
  response.headers.set("X-Novel-Deprecated-Route", DEFAULT_SCENES_ALIAS);
  response.headers.set("X-Novel-Canonical-Route", CANONICAL_SCENES_ROUTE);
  response.headers.set("X-Novel-Compatibility-Story", "default");
  return response;
}
