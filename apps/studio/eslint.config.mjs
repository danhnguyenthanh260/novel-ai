import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const legacyOversizedComponents = [
  "src/features/scenes/components/DraftRunner.tsx",
  "src/features/map/components/MapPageClient.tsx",
  "src/features/reviews/components/ReviewPanelClient.tsx",
];

const legacyOversizedServer = [
  "src/features/map/server/mapService.ts",
  "src/features/muse/server/museApiService.ts",
  "src/features/ingest/server/ingestApproveSplitService.ts",
  "src/features/ingest/server/ingestSplitDraftService.ts",
  "src/features/reviews/server/reviewApiService.ts",
  "src/features/story/server/libraryRepo.ts",
  "src/features/ingest/server/ingestJobsService.ts",
  "src/features/autowrite/server/autowriteRunService.ts",
  "src/features/map/server/mapApiService.ts",
  "src/features/guard/server/storyContextBuilder.ts",
  "src/features/ingest/server/ingestAuxService.ts",
  "src/features/ingest/server/ingestReprocessService.ts",
  "src/features/story/server/storyProfileService.ts",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/features/*/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*/server/*", "../server/*", "../../server/*"],
              message:
                "Components must not import server modules. Use app/api or feature service boundaries.",
            },
          ],
        },
      ],
      "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 120, skipBlankLines: true, skipComments: true }],
      complexity: ["warn", { max: 12 }],
      "max-depth": ["warn", 4],
    },
  },
  {
    files: ["src/features/*/server/**/*.ts"],
    rules: {
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 100, skipBlankLines: true, skipComments: true }],
      complexity: ["warn", { max: 12 }],
      "max-depth": ["warn", 4],
    },
  },
  {
    files: legacyOversizedComponents,
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      complexity: "off",
      "max-depth": "off",
    },
  },
  {
    files: legacyOversizedServer,
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      complexity: "off",
      "max-depth": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
