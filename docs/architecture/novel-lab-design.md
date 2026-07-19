# Novel Lab Design System (Canonical)

This document is the single source of truth for Novel Lab Studio UI/UX. It
supersedes the earlier dark-first, no-icons direction. The new default visual
direction is a Manus-inspired editorial writing studio, adapted from the local
reference `refero.design - Signing up & onboarding on Manus.zip`.

The reference is not to be copied mechanically. Translate its quiet onboarding,
centered task focus, light canvas, restrained controls, and progressive
disclosure into a product system for story writing, context management,
readiness review, artifacts, and pipeline execution.

## 1. Philosophy: Manus-Inspired Editorial Workspace

Novel Lab should feel like a calm creative operating room: one clear intent in
the center, surrounding tools available only when they help the writing task.

- **Clarity over atmosphere**: reduce cyberpunk/neon styling, heavy chrome,
  dense borders, and competing status surfaces.
- **Writing-first rhythm**: hierarchy follows the work sequence
  `story setup -> context readiness -> command -> artifact -> review`.
- **Progressive disclosure**: advanced tools exist, but they enter through
  panels, modals, sheets, or task cards instead of page-wide dashboards.
- **Status over dashboard**: use compact semantic labels, progress bars, and
  readiness summaries instead of charts or decorative telemetry.
- **Preserve the existing product strengths**: the chat-first Write workspace,
  slash commands, artifact inspector, readiness language, task cards, and
  pipeline progress model remain core.

## 2. Layout System

### Default App Frame

The default frame is light, low-noise, and spacious:

1. **Quiet left rail or narrow nav**: story navigation, primary surfaces, and
   durable app state. It should feel more like the Manus icon rail than a dense
   IDE sidebar.
2. **Centered command/work area**: the user's current writing intent, composer,
   onboarding step, or review decision sits in the visual center.
3. **Inspector/artifact panel**: context digests, artifacts, memory evidence,
   pipeline progress, and review findings open beside the main stream.

Avoid full-page destination hopping for normal work. Routes may remain as deep
links, but the experience should stay anchored around chat, composer, and
panels.

### Write Workspace Contract

The existing "Write" workspace remains a 3-zone workspace:

1. **Left (Nav Panel)**: stories, chapters, operations, and story-level context.
2. **Center (Command Work Stream)**: conversation, composer, slash commands,
   workflow progress, compact result summaries, and approval gates.
3. **Right (Artifact Workspace)**: editable prose, artifact previews,
   readiness evidence, review actions, and inspector modes.

The viewport stays locked. Only internal panels scroll. Long prose and full
artifacts belong in the right workspace, not inside the chat stream.

### Toggle Behavior

- **Context Mode (default)**: show readiness, context digest, memory evidence,
  workflow progress, or selected timeline block details.
- **Artifact Mode (active)**: expand the writing surface for draft prose,
  artifact preview, or structured output.
- **Panel behavior**: secondary panels should be dismissible, resizable where
  useful, and restorable without losing workflow state.

## 3. Visual Tokens

### Default Theme: Light Editorial

Use these as the canonical token targets. Names may map to Tailwind/shadcn
variables, but new UI should reference tokens rather than hardcoded colors.

| Role | Token | Value | Usage |
|---|---|---:|---|
| App background | `--bg-app` | `#F7F6F2` | page canvas |
| Canvas background | `--bg-canvas` | `#FBFAF7` | centered work area, onboarding |
| Surface | `--bg-surface` | `#FFFFFF` | cards, dialogs, popovers |
| Muted surface | `--bg-surface-muted` | `#F2F1EC` | secondary panels, hover |
| Sidebar | `--bg-sidebar` | `#ECEBE6` | left rail/nav |
| Border subtle | `--border-subtle` | `#DDD9D0` | cards, inputs, separators |
| Border strong | `--border-strong` | `#C9C3B8` | active panels, focus support |
| Text primary | `--text-primary` | `#191917` | headings, body |
| Text secondary | `--text-secondary` | `#5F5D57` | descriptions, labels |
| Text muted | `--text-muted` | `#8A867D` | metadata, placeholders |
| Primary | `--primary` | `#191917` | primary CTA, selected primary action |
| Primary foreground | `--primary-foreground` | `#FFFFFF` | text on primary |
| Accent | `--accent` | `#1677D2` | selected plan/state, focus, links |
| Success | `--success` | `#228B5A` | verified, complete |
| Warning | `--warning` | `#A66A00` | partial, needs review |
| Danger | `--danger` | `#C23B35` | blocked, destructive |

### Dark Focus Mode

The old dark palette may remain as a secondary focus/compatibility mode while
surfaces migrate. It is not the default theme. Do not expand the dark neon
direction for new default UI.

### Rhythm And Texture

- Use a subtle off-white canvas. A dotted background is allowed for onboarding,
  empty states, and first-run setup, but not as decoration on dense work panels.
- Keep panels flat and bounded by subtle borders. Avoid glowing accents,
  saturated gradients, heavy shadows, and cyberpunk framing.
- Use color sparingly. Black is the primary action color; blue is for selected
  state and focus; green, amber, and red are semantic status colors.

## 4. Typography And Spacing

### Typography

- **UI sans**: use `Inter` or the current app sans for controls, body, labels,
  panels, and forms.
- **Editorial serif**: use a restrained serif only for first-run/empty-state
  headlines or story-level hero moments. Candidate families: `Newsreader`,
  `Literata`, or a system serif fallback. Do not use serif inside dense
  controls or long-running workflow cards.
- **Monospace**: reserve `JetBrains Mono` for command IDs, file paths, payload
  IDs, shortcuts, and machine-readable metadata.

### Type Scale

- Body: 14px to 15px
- Secondary labels: 12px to 13px
- Metadata/status: 11px to 12px
- Panel title: 16px to 18px
- Empty-state headline: 32px to 44px, only when the first viewport still keeps
  the next action visible

### Spacing

- Use an 8px base grid.
- Onboarding/form width: 520px to 560px.
- Main composer/work prompt width: 760px to 960px depending on viewport.
- Right inspector width: 320px to 420px for context; artifact mode may expand.
- Card radius: 10px to 12px.
- Dialog/modal radius: 18px to 24px when centered and sparse.
- Toolbars and rails should remain compact, but not cramped.

## 5. Components And Interaction

### Actions

- **Primary action**: black fill, white text, strong disabled state, clear
  loading state.
- **Secondary action**: white or muted surface, subtle border, primary text.
- **Tertiary action**: text button or low-emphasis control.
- One primary action per zone unless the user is resolving a comparison or
  confirmation.

### Inputs And Composer

- Inputs use light surfaces, visible but soft borders, 10px to 12px radius, and
  concise inline validation.
- The central composer is the primary work object. It can contain mode/tool
  pills, attach/context controls, and a single submit action.
- Slash-command behavior stays inside the composer flow. The global command
  palette remains separate.

### Cards And Panels

- Cards represent repeatable objects: stories, prompt examples, readiness
  checks, memory items, artifact previews, and workflow blocks.
- Avoid nested cards. Use section headers, separators, or grouped rows instead.
- Empty states should offer concrete next actions, not marketing copy.

### Status And Readiness

- Status pills use semantic colors only: success, warning, danger, accent, and
  muted.
- Readiness review should summarize what is available, what is missing, and
  what action will improve output quality.
- Pipeline execution should show compact progress blocks and preserve the
  artifact/result link.

### Icons

Icons are allowed only when they reduce scanning cost in navigation, status,
tool pills, or familiar controls. They must be:

- semantic, not decorative
- visually quiet, consistent 16px or 20px stroke style
- paired with visible text or `aria-label`/`sr-only` text
- absent from prose, status copy, and decorative headings

Do not use emoji as UI icons. Do not introduce mixed icon families.

## 6. Flow Patterns To Adapt From The Reference

- **First-run setup**: centered form/card, one clear step, muted helper text,
  strong primary CTA, inline validation.
- **Verification steps**: OTP/confirmation flows should be minimal, with the
  next action and fallback links visible.
- **Plan or capability selection**: use clean comparison rows/cards, blue only
  for selected state, and black for the final CTA.
- **Welcome/activation modal**: use a restrained centered modal for major
  milestones, then route the user into the Write workspace.
- **Prompt workspace home**: for empty or first-open states, center a large
  intent prompt, composer, mode pills, and a few practical prompt examples.

## 7. Novel-AI Screen Priorities

Upgrade screens in this order:

1. **Write empty/first-open state**: turn the current starting point into a
   calm central prompt workspace with story setup, readiness, and sample
   writing actions.
2. **Readiness review and context digest**: make context quality clear before
   generation. This is the highest-impact flow for output quality.
3. **Artifact workspace**: restyle prose preview, edit/review controls, and
   artifact metadata on the new light surfaces.
4. **Memory, reviews, ingest, and pipelines**: migrate each as panels/cards
   around the chat-first workflow instead of standalone dashboard pages.
5. **Onboarding/sign-up if productized**: use the reference's linear account,
   verification, selection, and welcome pattern as the baseline.

## 8. Component Kit (shadcn/ui)

The shared component kit lives in `apps/studio/src/components/ui/`. Canonical
adoption spec: `docs/operations/specs/chat-first-ui-shell-and-shadcn-adoption.md`.

- New components MUST use kit primitives plus Tailwind utilities.
- Do NOT add new permanent classes to `globals.css`; the legacy stylesheet is
  being retired surface-by-surface.
- Kit theme tokens are aliases of the palette in section 3. Never hardcode
  colors in components.
- Icons must follow the policy in section 5. Component defaults may be adapted
  if they import icons that do not fit this system.

## 9. Do / Don't For Agents

- **DO** preserve chat-first Write contracts.
- **DO** use the 8px grid for new layouts.
- **DO** prefer centered, sparse onboarding and empty states.
- **DO** use black primary actions and semantic status colors.
- **DO** keep right-panel artifacts and inspector modes intact.
- **DON'T** return to neon teal/amber as the default visual identity.
- **DON'T** add decorative gradients, glow, or dark cyberpunk framing.
- **DON'T** use icons as decoration or replace necessary labels with icons.
- **DON'T** introduce colors outside the token system.
- **DON'T** create permanent sidebars for secondary information.
