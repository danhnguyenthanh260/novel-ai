# Chat-First UI Shell And shadcn/ui Adoption (Canonical Spec)

Status: Active
Created: 2026-06-11
Owner area: FE
Related canon: `docs/architecture/novel-lab-design.md`, `.agents/skills/chat-first-workspace/SKILL.md`, `docs/operations/specs/studio-chat-orchestration-layer.md`

## 1. Purpose

Make the whole studio app behave like the Write workspace already does: the user
works through chat, the AI orchestrates work, and professional tooling surfaces
open as panels around the conversation instead of standalone destination pages.
At the same time, unify the visual layer on one component kit (shadcn/ui) so UI
stops drifting per feature.

Product slogan: chat is the workspace, saved memory is the product, databases
are projections of canon.

## 2. Evidence (current state, audited 2026-06-11)

- Stack: Next.js 16, React 19, Tailwind v4. No component library.
- `src/app/globals.css` is ~1,900 lines of hand-rolled BEM-style classes mixed
  with Tailwind utilities in components. Two styling idioms coexist; each
  feature invents its own controls. This is the root cause of UI inconsistency.
- Each story exposes 12 sibling pages (`write`, `map`, `ingest`, `memory`,
  `reviews`, `muse`, `analysis`, `agents`, `pipelines`, `feedback`,
  `settings`). Primary navigation is page-hopping.
- `src/components/layout/TriPanelLayout.tsx` is imported nowhere (dead code).
- Chat exists in three disconnected surfaces: Write tab
  (`features/scenes/components/writeTab/chatOrchestration/`), Muse chat, and
  the assistant API (`app/api/stories/[slug]/assistant/*`).
- The Write tab already implements the target doctrine (center stream =
  intent + compact results, right panel = artifacts, readiness language for
  missing context).

## 3. Decisions

| Decision | Option chosen | Option rejected | Reason |
|---|---|---|---|
| Component layer | shadcn/ui (copy-in) | Custom kit, MUI/Mantine | Tailwind v4 + React 19 support, no lock-in, theme maps onto existing tokens |
| Theming | Map existing `:root` tokens to shadcn CSS variables | New palette | `novel-lab-design.md` palette is canon; zero visual reset |
| Icons | Strip lucide icons from copied components, use plain-text glyphs | Keep lucide defaults | Design canon forbids SVG/icon fonts ("No Icons" rule) |
| Navigation target | Chat + command palette + panels; pages kept as deep links | Delete pages | Deep links and E2E paths must keep working during migration |
| Migration style | Strangler (per-surface) | Big-bang rewrite of `globals.css` | 1,900-line stylesheet underpins live surfaces; replace per migrated surface |

## 4. Target architecture

```text
┌──────────────────────────────────────────────────┐
│ Topbar: story switcher · command palette · status│
├──────────────────────────┬───────────────────────┤
│ CHAT (persistent per     │ INSPECTOR / ARTIFACT  │
│ story, one assistant)    │ PANEL (professional   │
│ - context cards          │ surfaces live here:   │
│ - workflow progress      │ ingest, memory,       │
│ - approval gates         │ reviews, pipelines…)  │
│ - compact results + link │                       │
└──────────────────────────┴───────────────────────┘
```

- One assistant conversation per story, shared across surfaces. Muse chat and
  Write assistant converge on `features/chat-orchestration`.
- "Chat showed" vs "chat saved" stay distinct: context cards show what the
  model used; approval gates decide what becomes canon (PostgreSQL first,
  Neo4j/Qdrant as projections).
- Command palette (Ctrl/Cmd+K) is a separate surface for navigation and
  actions. Per `chat-first-workspace` rules, the slash-command menu must NOT
  become a permanent palette; the two coexist.
- The 12 story pages remain routable but become panel-first: chat and palette
  open them as sheets/panels; URLs deep-link into the same panels.

## 5. Token mapping (Phase 1)

shadcn variables are aliases of the existing canon tokens. The legacy CSS var
`--accent` (teal) keeps its name for the 1,900-line stylesheet; the Tailwind
`accent` color token is mapped separately to the hover surface so shadcn
hover/active states stay subtle.

| shadcn token | Mapped to | Note |
|---|---|---|
| `background` / `foreground` | `--bg-app` / `--text-primary` | already present |
| `card`, `popover` | `--bg-surface` | navy slate |
| `primary` | `--accent` (#42C7B8) | teal, dark foreground |
| `secondary`, `accent` (Tailwind token) | `--bg-hover` | subtle hover states |
| `muted` | `--bg-surface-muted` / `--text-muted` | |
| `destructive` | `--danger` | |
| `border` / `input` | `--border-subtle` / `--border-strong` | |
| `ring` | `--accent` | focus ring teal |
| `radius` | `--radius-md` (12px) | |

Dark-only: the app is dark-first by canon; no `.dark` variant is introduced.

## 6. Rollout phases

1. **Foundation (this spec's first PR)**: `components.json`, `src/lib/utils.ts`
   (`cn`), token mapping in `globals.css`, copied kit primitives under
   `src/components/ui/` (button, card, badge, separator, input, textarea,
   tabs, dialog, sheet, command, popover, dropdown-menu, tooltip, skeleton,
   scroll-area, sonner), icons stripped. No behavior change to existing pages.
2. **Unified shell**: new AppShell with persistent chat dock, right inspector,
   command palette; every story page openable as a panel from chat.
3. **Surface migration** (order: memory/reviews → ingest → muse/analysis →
   agents/pipelines): each surface re-skinned on the kit, its bespoke
   `globals.css` blocks deleted in the same PR.
4. **Chat coverage**: every long-running workflow emits `workflow_progress`
   blocks; every result renders as a card with an open-panel action.

## 7. Rules for new code

- New components MUST use `src/components/ui/` primitives and Tailwind
  utilities. Do NOT add new classes to `globals.css`.
- Copied shadcn components MUST NOT import `lucide-react` or other icon sets.
  Use plain-text glyphs (`×`, `✓`, `›`) with `sr-only` labels.
- Do not introduce colors outside the canon palette; extend the token mapping
  instead.
- Keep the chat-first contracts from `.agents/skills/chat-first-workspace/`:
  prose and artifacts belong to the right panel, not the chat stream.

## 8. Quality gates (per rollout PR)

```text
Build:
  - [ ] npm run typecheck passes
  - [ ] npm run build passes
  - [ ] npx eslint <changed files> passes
Visual:
  - [ ] No new colors outside canon palette
  - [ ] No icons (SVG/icon font/emoji) in shipped UI
Behavior:
  - [ ] Existing story page routes still resolve
  - [ ] Write workspace chat contracts unchanged
```
