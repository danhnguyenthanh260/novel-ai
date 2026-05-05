# Refined Issue #46: Pipeline Toggle & Workspace Infrastructure Refinement

## Context
The current implementation of the Pipeline toggle and the 3-zone workspace relies on fragile CSS gaps and inline widths, leading to layout leaks and inconsistent aesthetics. This issue expands to include a full infrastructure cleanup and typography refinement.

## Scope Expansion
1.  **Typography**: Reduce global font scale by 1 level (13px baseline) to improve information density.
2.  **Infrastructure**: 
    *   Transition from grid-gap-based borders to explicit CSS borders to eliminate background leaks.
    *   Unify Sidebar and Container backgrounds to a solid `#101720`.
3.  **Layout Logic**: Ensure the Right Sidebar (Context/Artifact) fills its grid column 100% and remove conflicting inline widths.

## Acceptance Criteria
- [x] Body text reduced to 13px baseline.
- [x] Workspace grid background removed (no grey leaks).
- [x] Explicit borders added between all 3 zones.
- [x] Right sidebar fills 100% of its grid area.
- [x] Logic: Mutual exclusivity between Inspector Rail and Document Artifact remains functional.
- [x] Quality Gate: `npm run build` and `typecheck` passed.

## Implementation Details
- `globals.css`: Refactored `.novel-lab-workspace`, `.novel-lab-nav`, `.work-stream`, and `.artifact-inspector`.
- `NovelLabWorkspace.tsx`: Added dynamic grid columns based on toggle state.
- `ArtifactInspectorRail.tsx`: Removed inline width constraints.
- `StoryContext.tsx`: Added global visibility state for artifacts.
