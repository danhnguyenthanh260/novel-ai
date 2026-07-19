# Chat-First UI Shell And shadcn/ui Adoption (Canonical Spec)

Status: Active
Created: 2026-06-11
Owner area: FE
Related canon: `docs/architecture/novel-lab-design.md`, `.agents/skills/chat-first-workspace/SKILL.md`, `docs/operations/specs/studio-chat-orchestration-layer.md`

Design direction update: as of 2026-07-06, the default visual system is the
Manus-inspired light/editorial direction in `docs/architecture/novel-lab-design.md`.
That update supersedes the earlier dark-only, no-icons visual canon. The
chat-first architecture and shadcn adoption strategy remain active.

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
| Theming | Manus-inspired light/editorial default, with dark focus mode kept for compatibility | Continue dark-only cyberpunk direction | The new canon prioritizes clarity, lower noise, onboarding quality, and writing focus |
| Icons | Restricted semantic icons in nav/status/tooling, always labelled | Decorative icons, emoji UI, mixed icon families | The new canon allows icons only when they reduce scanning cost without hiding meaning |
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

shadcn variables are aliases of the design tokens in
`docs/architecture/novel-lab-design.md`. New UI uses the light/editorial tokens
as the default. The old dark tokens may remain as a secondary focus mode or
compatibility bridge while migrated surfaces are retired.

| shadcn token | Mapped to | Note |
|---|---|---|
| `background` / `foreground` | `--bg-app` / `--text-primary` | light app canvas and primary text |
| `card`, `popover` | `--bg-surface` | white elevated surfaces |
| `primary` | `--primary` / `--primary-foreground` | black CTA, white text |
| `secondary` | `--bg-surface-muted` / `--text-primary` | quiet secondary controls |
| `accent` | `--accent` | selected state, focus, links |
| `muted` | `--bg-surface-muted` / `--text-muted` | metadata and disabled context |
| `destructive` | `--danger` | |
| `border` / `input` | `--border-subtle` / `--border-strong` | |
| `ring` | `--accent` | blue focus ring |
| `radius` | `--radius-md` (10px to 12px) | cards, buttons, inputs |

Dark focus mode may be introduced with a `.dark` or equivalent scope only after
the default light tokens are stable. Do not block the light migration on dark
mode completeness.

## 6. Rollout phases

1. **Foundation**: align `components.json`, `src/lib/utils.ts` (`cn`), token
   mapping in `globals.css`, and copied kit primitives under
   `src/components/ui/` with the light/editorial design tokens. Establish the
   restricted semantic icon policy. No behavior change to existing pages.
2. **Unified shell**: AppShell gains a quiet rail/nav, global command palette
   (Ctrl/Cmd+K: surface navigation, story switching, actions), and an Assistant
   dock/right panel for story context digest, recent durable conversations, and
   handoff to the Write workspace. The dock is read/resume only for now; the
   global composer requires extracting the Write orchestration layer and ships
   with phase 4.
3. **Surface migration** (order: Write empty/first-open -> readiness/context
   digest -> artifact workspace -> memory/reviews -> ingest -> muse/analysis
   -> agents/pipelines): each surface is re-skinned on the kit, and its bespoke
   `globals.css` blocks are deleted in the same PR.
4. **Chat coverage**: every long-running workflow emits `workflow_progress`
   blocks; every result renders as a card with an open-panel action.

## 7. Rules for new code

- New components MUST use `src/components/ui/` primitives and Tailwind
  utilities. Do NOT add new classes to `globals.css`.
- Copied shadcn components may import an approved icon set only when the icon
  follows the semantic icon policy in `novel-lab-design.md`. Icons require a
  visible label or accessible text.
- Do not introduce colors outside the canon token map; extend the token mapping
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
  - [ ] No hardcoded colors outside canon tokens
  - [ ] Light/editorial default matches `novel-lab-design.md`
  - [ ] Icons follow semantic icon policy and have text/ARIA support
  - [ ] No decorative emoji, glow, neon framing, or cyberpunk accent overload
Behavior:
  - [ ] Existing story page routes still resolve
  - [ ] Write workspace chat contracts unchanged
```
