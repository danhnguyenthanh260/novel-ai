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

const secondaryWorkspaceSegments = [
  "memory",
  "analysis",
  "analyze",
  "reviews",
  "review",
  "ingest",
  "pipelines",
  "pipeline",
];

const secondaryWorkspaceSegmentPattern = secondaryWorkspaceSegments.join("|");
const secondaryWorkspaceRoutePattern = new RegExp(
  `^/stories/[^/?#]+/(${secondaryWorkspaceSegmentPattern})(?:[/?#]|$)|^/(${secondaryWorkspaceSegmentPattern})(?:[/?#]|$)`
);

function staticStringValue(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type !== "TemplateLiteral") return null;

  return node.quasis.reduce((value, quasi, index) => {
    const text = quasi.value.cooked ?? quasi.value.raw;
    return index < node.quasis.length - 1 ? `${value}${text}__dynamic_segment__` : `${value}${text}`;
  }, "");
}

function isRouterPushCall(node) {
  return (
    node.callee?.type === "MemberExpression" &&
    node.callee.object?.type === "Identifier" &&
    node.callee.object.name === "router" &&
    node.callee.property?.type === "Identifier" &&
    node.callee.property.name === "push"
  );
}

function isSecondaryWorkspaceRoute(node) {
  const target = staticStringValue(node);
  return target ? secondaryWorkspaceRoutePattern.test(target) : false;
}

function isSecondaryWorkspaceHrefCall(node) {
  const workspace = node?.arguments?.[1];
  return (
    node?.type === "CallExpression" &&
    node.callee?.type === "Identifier" &&
    node.callee.name === "workspaceHref" &&
    secondaryWorkspaceSegments.includes(staticStringValue(workspace))
  );
}

const chatFirstPolicyPlugin = {
  rules: {
    "no-secondary-workspace-router-push": {
      meta: {
        type: "problem",
        docs: {
          description: "Prevent command handlers from navigating directly to secondary workspaces.",
        },
        schema: [],
        messages: {
          secondaryWorkspaceRouterPush:
            "Command handlers must render the chat/inspector result first. Add secondary workspace URLs as action links instead of calling router.push(...).",
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            if (!isRouterPushCall(node)) return;
            const target = node.arguments[0];
            if (!isSecondaryWorkspaceRoute(target) && !isSecondaryWorkspaceHrefCall(target)) return;

            context.report({
              node,
              messageId: "secondaryWorkspaceRouterPush",
            });
          },
        };
      },
    },
  },
};

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
    files: ["src/features/scenes/components/writeTab/chatOrchestration/commands/**/*.{ts,tsx}"],
    plugins: {
      "chat-first-policy": chatFirstPolicyPlugin,
    },
    rules: {
      "chat-first-policy/no-secondary-workspace-router-push": "error",
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
