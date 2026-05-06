# Default URL UI Pipeline Audit

Date: 2026-05-05 UTC  
Issue: #49  
Branch: `docs/49-default-url-ui-pipeline-audit`

## Scope

This audit checks the default Studio entrypoint and adjacent UI surfaces for full pipeline readiness:

- Default URL bootstrap.
- Story selection and story creation.
- Ingest setup and ingest operations.
- Analysis and memory review surfaces.
- Write workspace command flow and artifact handling.
- Review, reader, and publish handoff visibility.

The audit answers whether each visible UI surface is used, functional, useful, necessary, and sufficient for a user to complete the full pipeline from start to finish.

## Environment

Runtime browser verification could not be completed in this environment because local infrastructure was not available:

- `docker` was not installed or not exposed inside the active WSL environment.
- No local Studio, Postgres, or Historian ports were listening on the expected ports checked: `3000`, `3001`, `3002`, `5433`, and `8090`.

This report is therefore based on source inspection plus build and typecheck verification.

## Executive Verdict

The default Studio UI is not ready to be called an end-to-end author pipeline yet.

It is a useful developer/operator workspace with several real surfaces already in place. The main gaps are not isolated visual polish issues. The gaps are pipeline continuity, placeholder controls, and missing state-backed handoffs between ingest, analysis, writing, review, memory, reader, and publish.

Current state:

- Default `/` opens the write workspace when the database and at least one story path are available.
- Story navigation, ingest, analysis, memory, review, and writing surfaces exist.
- Ingest has real operational controls.
- Writing has real chapter creation, AutoWrite entry, draft staging, draft saving, and continuity actions.
- Many visible controls still look actionable but are static, local-only, or partially wired.
- A new user cannot reliably start from `/` and complete ingest -> analysis -> writing -> review -> memory -> reader/publish without knowing internal route structure.

Recommendation: keep #49 closed by this audit report, then create follow-up implementation issues in priority order. Do not merge broad UI implementation work into this audit PR.

## Surface Inventory

| Surface | Used? | Functional? | Useful? | Necessary? | Evidence | Finding |
|---|---:|---:|---:|---:|---|---|
| Default `/` route | Yes | Partial | Yes | Yes | `apps/studio/src/app/page.tsx` selects the first story and renders `WriteTabClient`. | Root depends on DB access and falls back to slug `default` without a visible no-story/no-DB recovery state. |
| App shell header | Yes | Partial | Yes | Yes | `apps/studio/src/components/AppShell.tsx` renders story selector, context bar, and pipeline toggle. | Main navigation is useful, but status labels such as worker and draft state appear static. |
| Story selector | Yes | Yes | Yes | Yes | `apps/studio/src/features/story/StorySelector.tsx` exposes Pipelines, Ingest, Write, Analysis, Memory, Map, Reviews, Feedback, Settings, and Story Shelf. | Creation pushes users to Pipelines, but the user is not guided into ingest as the next author action. |
| Novel Lab left navigation | Yes | No | Partial | Partial | `apps/studio/src/features/scenes/components/writeTab/NovelLabWorkspace.tsx` renders Shelf, Write, Artifacts, Memory, Reviews, Reader, and Publish as static elements. | These labels look like navigation but are not links or buttons. |
| Novel Lab operations links | Yes | No | Partial | Partial | `NovelLabWorkspace.tsx` renders Pipeline and Settings as static elements. | They duplicate real app shell navigation without functioning. |
| Write command stream | Yes | Partial | Yes | Yes | `CommandWorkStream.tsx` exposes `/write chapter`, `/check continuity`, and additional commands. | Only `/write chapter` and `/check continuity` have concrete submit behavior; analysis, rewrite, memory extraction, review, approval, and publish commands are currently placeholders. |
| Artifact surface | Yes | Partial | Yes | Yes | `ArtifactSurface.tsx` supports create draft, save draft, and continuity check. | Read/Edit/Analyze/Review/Approve tabs have no backed tab behavior; readiness check has no action; approve remains locked. |
| Artifact inspector rail | Yes | Partial | Partial | Partial | `ArtifactInspectorRail.tsx` shows context, issues, memory, and version previews. | Inspector content is mostly static example state rather than actual workflow diagnostics. |
| Ingest jobs page | Yes | Yes | Yes | Yes | `IngestJobsPageView.tsx` exposes refresh, worker controls, upload/source panels, split panels, and validation. | Functional but operator-heavy; source setup is hidden behind details while worker controls are prominent. |
| Upload source panel | Yes | Yes | Yes | Yes | `UploadSourcePanel.tsx` supports ZIP, MEGA, paste payloads, split mode, review mode, self-healing, validation, and job creation. | The control set is powerful but too dense for the default author path without guided defaults. |
| Analysis workspace | Yes | Yes | Yes | Yes | `AnalysisWorkspacePage.tsx` exposes chapter, arc, saga, and core lore tabs. | Exists as a separate route, but is not clearly handed off from ingest or write. |
| Memory hub | Yes | Yes | Yes | Yes | `MemoryHubPage.tsx` covers chapter, arc, saga, core lore, and conflict review. | Good capability hub, but not yet a natural continuation from writing artifacts. |
| Review panel | Yes | Yes | Yes | Yes | `ReviewPanelView.tsx` supports request selection, V3 chapter review form, and responses. | Functional as a route, but write artifacts do not visibly create or hand off review requests. |
| Reader / publish | Partial | Partial | Yes | Yes | Reader and Publish are visible in the write workspace left navigation; build output includes `/read/[slug]/[chapter]`. | Reader has a route, but the write workbench does not expose a real handoff to it. Publish appears as a dead workbench label and no publish route was found in the inspected app pages. |

## Full Pipeline Trace

### New Story Path

| Step | Current behavior | Readiness |
|---|---|---|
| Open `/` | Server route loads stories and renders the write workspace for the first story. | Partial |
| No database available | Root can fail before rendering a recovery UI. | Fail |
| No story exists | Root passes `default` as slug, but user guidance depends on downstream behavior. | Partial |
| Create story | Story selector can create a story and redirects to `/stories/{slug}/pipelines`. | Pass |
| Add source material | Ingest route and upload panel exist, but are not presented as the obvious next step after story creation. | Partial |
| Run ingest and split | Ingest controls exist and support worker/job operations. | Pass |
| Analyze source/chapter | Analysis and memory hubs exist, but handoff from ingest is weak. | Partial |
| Write chapter | Write workspace can create chapters, open AutoWrite, and save staged drafts. | Pass |
| Validate continuity | `/check continuity` and artifact continuity action exist. | Pass |
| Review and approve | Review route exists, but artifact approval is locked and not connected to review state. | Partial |
| Reader / publish | Reader route exists, but reader/publish handoff is not implemented in the inspected workbench path. | Partial |

### Existing Story Path

The existing story path is stronger than the new story path. A user with a selected story can navigate to ingest, analysis, memory, review, and write from the app shell. However, the UI still behaves like separate tools rather than one guided pipeline. The author must know which surface to open next.

## Findings

### P0: Default URL Has No Resilient Bootstrap State

`apps/studio/src/app/page.tsx` calls `listStories(pool)` in the root route and directly renders `WriteTabClient`. If the DB is down, empty, or unreachable, the user does not get a clear recovery state from the default URL.

Follow-up issue:

```text
[Feature][FE + BE] Add resilient default Studio bootstrap and no-story state
```

### P1: Workbench Navigation Contains Dead Controls

`NovelLabWorkspace.tsx` renders labels such as Shelf, Artifacts, Memory, Reviews, Reader, Publish, Pipeline, and Settings as static elements. They look like navigation but do not navigate or perform actions.

Follow-up issue:

```text
[Task][FE] Replace Novel Lab placeholder navigation with real links or hide it
```

### P1: Command Palette Exposes Commands Without Execution Paths

`CommandWorkStream.tsx` exposes commands for analyze, rewrite, memory extraction, review, approval, and publish. Submit handling only wires `/write chapter` and `/check continuity`.

Follow-up issue:

```text
[Feature][FE + BE + AI] Wire slash commands to typed workflow actions
```

### P1: Artifact Tabs And Approval UI Are Not State-Backed

`ArtifactSurface.tsx` renders tabs for Read, Edit, Analyze, Review, and Approve, but those tabs do not drive visible state. Readiness check is rendered without an action, and approval remains locked.

Follow-up issue:

```text
[Feature][FE] Connect artifact tabs and approval gates to real workflow state
```

### P1: Pipeline Has No Guided Next Action Layer

The required product flow exists as separate routes, but the default UI does not clearly guide the user from ingest to analysis to writing to review to publish. Story creation redirects to the pipeline page, while ingest setup is hidden behind an operational surface.

Follow-up issue:

```text
[Feature][FE] Add guided pipeline next-action rail from ingest through review
```

### P2: Ingest Is Functional But Too Operator-Heavy For Default Author Flow

`IngestJobsPageView.tsx` makes worker controls prominent and hides setup panels in expandable sections. This is useful for operators, but not ideal as the default author entry into source ingestion.

Follow-up issue:

```text
[Task][FE] Separate author ingest flow from operator controls
```

### P2: Header Status Labels Appear Static

`AppShell.tsx` shows compact state labels such as worker and draft status. Source inspection did not find backing state for those labels.

Follow-up issue:

```text
[Task][FE] Replace static header workflow labels with real state or remove them
```

### P2: Inspector Rail Uses Static Preview State

`ArtifactInspectorRail.tsx` provides a useful structure for context, issues, memory, and version inspection, but much of its content is static preview text rather than actual workflow diagnostics.

Follow-up issue:

```text
[Feature][FE + BE] Bind artifact inspector to workflow diagnostics
```

### P2: Reader And Publish Handoff Is Not Defined

The workbench exposes Reader and Publish as labels, and the built app includes a reader route at `/read/[slug]/[chapter]`. The inspected write flow still does not provide a real path from approved artifact to reader preview or publish preparation.

Follow-up issue:

```text
[Feature][FE] Define reader and publish handoff from approved artifacts
```

## Priority Implementation Queue

| Status | Follow-up | Branch | PR |
|---|---|---|---|
| Done on `staging` | `[Feature][FE + BE] Add resilient default Studio bootstrap and no-story state` | `feature/default-studio-bootstrap` | #59 |
| Done on `staging` | `[Feature][FE] Add guided pipeline next-action rail from ingest through review` | `feature/guided-pipeline-next-action` | #60 |
| Done on `staging` | `[Task][FE] Replace Novel Lab placeholder navigation with real links or hide it` | `feature/novel-lab-real-navigation` | #61 |
| Done on `staging` | `[Feature][FE + BE + AI] Wire slash commands to typed workflow actions` | `feature/write-slash-command-actions` | #62 |
| Done on `staging` | `[Feature][FE] Connect artifact tabs and approval gates to real workflow state` | `feature/artifact-tabs-approval-state` | #63 |
| Done on `staging` | `[Task][FE] Separate author ingest flow from operator controls` | `feature/author-ingest-flow` | #64 |
| Done on `staging` | `[Feature][FE + BE] Bind artifact inspector to workflow diagnostics` | `feature/artifact-inspector-diagnostics` | #65 |
| Done on `staging` | `[Feature][FE] Define reader and publish handoff from approved artifacts` | `feature/reader-publish-handoff` | #66 |

Status updated: 2026-05-06 UTC.

Implementation verification completed across the follow-up PRs:

- `npm run typecheck`
- Changed-file ESLint for each touched Studio surface
- `npm run build`
- `git diff --check`

Runtime smoke status:

- `GET /` returned `200 OK` with DB-offline recovery state.
- `GET /shelf` returned `200 OK`.
- Full DB-backed browser walkthrough remains blocked until the local Docker daemon/PostgreSQL stack is available.

## Issue #49 Acceptance Status

- [x] Default URL entrypoint inspected.
- [x] Visible UI surfaces inventoried.
- [x] Each major surface classified for use, function, usefulness, necessity, and pipeline readiness.
- [x] Full pipeline from ingest through analysis, writing, review, and publish assessed.
- [x] Placeholder and dead-control risks identified.
- [x] Follow-up implementation issue queue proposed.
- [x] Follow-up implementation queue completed on `staging`.
- [ ] Full DB-backed runtime browser walkthrough completed.

Full DB-backed runtime walkthrough remains unchecked because the Docker daemon was not available in the active WSL environment. A limited smoke test confirmed `/` recovery behavior and `/shelf` route rendering without PostgreSQL.

## Final Recommendation

Close #49 with this audit report and the completed follow-up queue. Treat the remaining full runtime walkthrough as an infrastructure-dependent verification item rather than an implementation gap.
