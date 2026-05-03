# [Feature][FE] Implement Pipeline toggle and refine Context Partial UI

## Agent Mode

### Purpose
Bridge the gap between background context tracking and active document editing by providing a toggleable workspace focused on the work stream.

### Desired end state
- "Context Partial" is refactored into a slim, resizable progress bar.
- Topbar includes a "Pipeline" text button to toggle the visibility of the "Document Artifacts" surface.
- "Document Artifacts" (Artifact Surface) is hidden by default when entering the "Write" workspace.
- The layout grid in `NovelLabWorkspace` adjusts dynamically based on the toggle state.

### Scope
- UI visibility state management in `StoryContext`.
- Topbar button and progress bar refactor in `AppShell`.
- Layout grid adjustments in `NovelLabWorkspace`.
- New CSS classes for the progress bar and toggle animations in `globals.css`.

### Out of scope
- Modifying the content generation logic of the writing pipeline.
- Changing the functionality of slash commands or artifact inspector rail contents.

### Acceptance criteria
- [ ] `ArtifactSurface` is hidden by default on first load of the Write workspace.
- [ ] Clicking the "Pipeline" button in the Topbar toggles the visibility of the right Artifact panel.
- [ ] When Artifacts are hidden, the center Command stream expands to fill the space.
- [ ] "Context Partial" indicator is visually slim and resembles a progress bar (Codex-inspired).
- [ ] Workspace remains usable and responsive during and after toggling.

### File manifest

MODIFY:
- `src/features/story/StoryContext.tsx` - Add `isArtifactVisible` and `setIsArtifactVisible`.
- `src/components/AppShell.tsx` - Add Pipeline toggle button and refactor `CompactContextBar`.
- `src/features/scenes/components/writeTab/NovelLabWorkspace.tsx` - Bind layout to `isArtifactVisible`.
- `src/app/globals.css` - Add styles for `.context-progress` and resizable behaviors.

### Boundary definition
- **Owns**: UI visibility state, workspace layout transitions, context indicator styling.
- **Does not own**: Narrative task execution, memory retrieval logic, artifact editing logic.

### Impact analysis
- **Direct impact**: `AppShell`, `NovelLabWorkspace`.
- **Downstream impact**: None identified.
- **Risk of regression**: Layout shift could affect scroll positions; ensure smooth transitions.

### Quality gates
- Build:
  - [ ] `npm run build` passes with zero errors.
- Tests:
  - [ ] `npm run typecheck` passes.
- Manual:
  - [ ] Verify toggle behavior on Desktop resolution.
  - [ ] Verify "Context Partial" looks like a progress bar.

### Estimate
Total: 3-4 hours
- State wiring: 0.5h
- Topbar refactor: 1h
- Workspace layout: 1h
- Styling and polish: 1h

### Dependencies
- Parent: None (Independent UI feature)
- Blocks: None

---

## Human Mode

### Situation
The current UI presents the Artifact Surface by default, which can be distracting during the initial writing/command phase. Additionally, the "Context Partial" indicator is currently a bulky status pill that doesn't effectively track progress or manage space.

### Approach and reasoning
We are moving the workspace towards a "Command First" focus. By hiding the Artifacts initially, we prioritize the work stream. The "Pipeline" button acts as a clear entry point for users ready to review artifacts. The "Context Partial" refactor into a progress bar aligns with modern AI workspace aesthetics (like Codex) and provides a more intuitive sense of "work in progress".

### Trade-off record
| Decision | Option chosen | Option rejected | Reason |
|---|---|---|---|
| Toggle State | Global Context | Component Local | Need to control visibility from the Topbar (global) to the Workspace (deep child) |
| UI Control | Text Label "Pipeline" | Icon | Prohibited by repo rules (No SVG/Icons) |

### What a reviewer should focus on
- Ensure the `NovelLabWorkspace` grid doesn't break when columns are removed.
- Check that the transition between "Context Partial" and "Artifacts" feels intentional.

### Known unknowns
- How the "resizable" requirement for the progress bar should behave exactly in a fixed-height header. (Recommendation: Focus on width-based space management first).
