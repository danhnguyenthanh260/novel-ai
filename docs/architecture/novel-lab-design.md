# Novel Lab Design System (Canonical)

This document serves as the single source of truth for the UI/UX design of Novel Lab Studio. All agents must follow these guidelines to maintain visual consistency and workflow focus.

## 1. Philosophy: Codex-like Workspace

The workspace is designed for deep creative focus, inspired by high-density technical editors like Codex or IDEs.

- **Focus over Clutter**: Minimize UI noise. Prioritize one primary action per zone.
- **Narrative Rhythm**: Hierarchy should follow the natural flow of writing (Context -> Command -> Artifact).
- **Minimalist Execution**: 
    - Keep only strictly necessary actions.
    - **No Icons**: Do not use SVG, Emoji, or Icon fonts. Use plain text labels.
    - **Status over Dashboard**: Use semantic labels and progress bars instead of complex charts.

## 2. Layout Structure: The 3-Zone Workspace

The "Write" workspace is a dynamic 3-column grid:

1.  **Left (Nav Panel - 236px)**: Contextual navigation (Stories, Chapters, Operations).
2.  **Center (Command Work Stream - 0.92fr)**: The "In-Progress" zone. Owns commands, task progress, and result summaries.
3.  **Right (Artifact Workspace - 1.18fr)**: The "Output" zone. Owns editable prose, review actions, and the inspector rail.

### Toggle Behavior (Issue #46)
- **Pipeline Toggle**: The Artifact Workspace has two modes:
  - **Context Mode (Default)**: Shows the `ArtifactInspectorRail` (320px width).
  - **Artifact Mode (Active)**: Shows the `ArtifactSurface` (Document view, 1.18fr width).
- **Expansion**: Grid layout dynamically adjusts: `grid-template-columns: 236px 1fr [320px | 1.18fr]`.

## 3. Visual Tokens

### Colors (Dark-First)
- **App Background**: `#0B0F14` (Deep obsidian)
- **Surface**: `#111827` (Navy slate)
- **Border**: `#2A3441` (Subtle blue-grey)
- **Text Primary**: `#E5E7EB`
- **Text Secondary**: `#9CA3AF`
- **Accent (Teal)**: `#42C7B8` (Used for active states and progress)
- **Accent 2 (Amber)**: `#F2B35F` (Used for warnings and partial states)

### Typography (Space Grotesk / JetBrains Mono)
- **Baseline**: 13px (Reduced for higher information density)
- **Secondary**: 11px
- **Metadata/Status**: 10px
- **Page Title**: 18px

### Spacing & Grid
- **Separation**: Use explicit `1px solid var(--border-subtle)` borders on columns. Avoid grid-gap background leaks.
- **Backgrounds**: Sidebar and Right-Zone (Context) use solid `var(--bg-sidebar)` (#101720).

## 4. Components & Interaction

### Controls
- Use semantic classes: `.shell-control`, `.shell-link`.
- **Primary Actions**: Use `.primary-action` with teal background and dark text.
- **Active States**: Highlighting should be subtle, using background opacity and accent borders.

### Progress & Status
- **Context Progress Bar**: A slim (3px) horizontal bar indicating the progress of background context assembly or task completion.
- **Status Pills**: Use `.status-pill` with color variants:
    - `--locked`: Amber (Locked)
    - `--drafting`: Teal (Drafting)
    - `--clean`: Green (Verified)
    - `--partial`: Amber (Incomplete)
    - `--blocked`: Red (Error)

### Novel Lab Command Stream
- Commands are invoked via the slash menu from the composer.
- Task cards should be compact and show machine-actionable status.

## 5. "Do / Don't" for Agents

- **DO** use plain text labels for all buttons.
- **DO** use the 8px grid for any new component layout.
- **DON'T** add icons, emojis, or SVGs to the UI.
- **DON'T** introduce new colors outside the defined palette.
- **DON'T** create permanent sidebars that cannot be toggled if they contain secondary information.
