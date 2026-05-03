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
- **Pipeline Toggle**: The Artifact Workspace is hidden by default. Use the "Pipeline" text button in the Topbar to toggle its visibility.
- **Expansion**: When the Artifact Workspace is hidden, the Command Work Stream expands to fill the remaining space (`grid-template-columns: 236px 1fr 0px`).

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
- **Body**: 14px (`text-sm`)
- **Labels/Meta**: 12px (`text-xs`)
- **Progress/Status**: 11px
- **Page Title**: 20px (`text-xl`)

### Spacing & Grid
- **Scale**: 8px (`4/8/12/16/24`)
- **Gaps**: `gap-2` (8px), `gap-3` (12px), `gap-4` (16px).

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
