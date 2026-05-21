# Chat-First Architecture Policy

Issue: #137
Parent epic: #134
Status: Active implementation policy
Last updated: 2026-05-17

## Purpose

Chat-first workspace commands must complete their core result inside the Write workspace before offering any secondary workspace navigation. The command handler owns command interpretation, timeline block creation, and inspector state changes. It does not own routing users away from the Write workspace for Memory, Analysis, Reviews, Ingest, or Pipeline workspaces.

## Scope

This policy applies to command handlers under:

```text
apps/studio/src/features/scenes/components/writeTab/chatOrchestration/commands/
```

It also applies to future extractions of the current command branches in:

```text
apps/studio/src/features/scenes/components/writeTab/CommandWorkStream.tsx
```

## Secondary Workspaces

Secondary workspaces are full-page operational or deep-inspection surfaces outside the primary chat flow:

```text
/stories/[slug]/memory
/stories/[slug]/analysis
/stories/[slug]/reviews
/stories/[slug]/ingest
/stories/[slug]/pipelines
```

`/stories/[slug]/analysis` is the canonical route. If a command, shortcut, or alias uses the word `analyze`, it still maps to the Analysis secondary workspace and follows the same rule.

## Forbidden Patterns

Command handlers must not directly route to secondary workspaces with `router.push`.

Forbidden examples:

```tsx
router.push(`/stories/${storySlug}/memory`);
router.push(`/stories/${storySlug}/analysis`);
router.push(`/stories/${storySlug}/analyze`);
router.push(`/stories/${storySlug}/reviews`);
router.push(`/stories/${storySlug}/ingest`);
router.push(`/stories/${storySlug}/pipelines`);
```

The same policy applies when the route is hidden behind a helper and then passed to `router.push`:

```tsx
router.push(workspaceHref(storySlug, "memory"));
router.push(workspaceHref(storySlug, "analysis"));
router.push(workspaceHref(storySlug, "reviews"));
router.push(workspaceHref(storySlug, "pipelines"));
```

## Allowed Patterns

Command handlers may provide a secondary link only after the command has rendered its primary result inside the Write workspace.

Allowed examples:

```tsx
args.onInspectorModeChange("memory");
args.onConversationBlock(buildContextDigestBlock(context, [
  { label: "Open full memory workspace", href: workspaceHref(storySlug, "memory") },
]));
```

```tsx
args.onInspectorModeChange("progress");
args.onConversationBlock(buildWorkspaceWorkflowBlock({
  id: `pipeline-${Date.now()}`,
  workflowName: "Pipeline Progress",
  stepLabel: "Inspecting active workflow state",
  chapterId,
  actionLabel: "Open full pipelines workspace",
  actionHref: workspaceHref(storySlug, "pipelines"),
}));
```

Allowed secondary links must be plain action links on rendered timeline or inspector content. They must not be automatic navigation.

## Correct Command Handler

```tsx
export async function runMemoryCommand(args: CommandHandlerArgs) {
  const snapshot = await loadMemorySnapshot(args.storySlug);

  args.onInspectorModeChange("memory");
  args.onConversationBlock({
    type: "context_digest",
    source: "backend",
    title: "Memory snapshot",
    included: snapshot.characters,
    missing: snapshot.missing,
    degraded: [],
    conflicts: [],
    action_links: [
      { label: "Open full Memory Hub", href: workspaceHref(args.storySlug, "memory") },
    ],
  });
}
```

This is correct because the command first renders the memory snapshot in the Write workspace. The full Memory Hub is a secondary link after the core result exists.

## Incorrect Command Handler

```tsx
export function runMemoryCommand(router: AppRouterInstance, storySlug: string) {
  router.push(`/stories/${storySlug}/memory`);
}
```

This is incorrect because the command leaves the Write workspace before rendering a chat result, inspector state, or artifact summary.

## ESLint Guard

`apps/studio/eslint.config.mjs` enforces this policy for command handler files under:

```text
src/features/scenes/components/writeTab/chatOrchestration/commands/**/*.{ts,tsx}
```

The rule flags `router.push(...)` calls that target Memory, Analysis, Reviews, Ingest, or Pipelines secondary workspaces. It also flags `router.push(workspaceHref(...))` when the helper target is one of those secondary workspaces.

## Review Checklist

Reviewers should verify that each command handler:

- renders a timeline block, inspector state, artifact preview, or workflow progress result before any secondary link appears;
- uses `workspaceHref(...)` only as an action link after the core result has rendered;
- does not call `router.push(...)` for secondary workspaces;
- keeps story switching and other primary navigation separate from secondary workspace escape hatches.
