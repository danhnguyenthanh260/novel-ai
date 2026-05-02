/**
 * Virtual Scene Provider: Authoring Core V3 Bridge
 *
 * Logic to parse Chapter Drafting (prose + markers) into Legacy Scene shapes
 * for UI compatibility during the Phase 2/3 transition.
 */

export interface VirtualScene {
  id: string; // Virtual ID: e.g., "vch01_s01"
  idx: number;
  title: string | null;
  status: string;
  text_content: string;
  is_virtual: boolean;
}

/**
 * Parses full chapter text into virtual scenes based on <!-- scene_break --> markers.
 */
export function parseVirtualScenesFromText(fullText: string): VirtualScene[] {
  if (!fullText) return [];

  // Split by marker: <!-- scene_break {"title": "..."} -->
  // Note: We use a regex that captures the optional JSON metadata
  const markerRegex = /<!--\s*scene_break\s*({.*?})?\s*-->/g;

  const scenes: VirtualScene[] = [];
  let lastIndex = 0;
  let sceneIdx = 1;
  let match;

  while ((match = markerRegex.exec(fullText)) !== null) {
    const segment = fullText.substring(lastIndex, match.index).trim();
    if (segment || sceneIdx === 1) {
      let title = null;
      if (match[1]) {
        try {
          const meta = JSON.parse(match[1]);
          title = meta.title || null;
        } catch (e) {
          // Ignore malformed JSON in markers
        }
      }

      scenes.push({
        id: `v_s${sceneIdx}`,
        idx: sceneIdx,
        title,
        status: "LOCKED", // Virtual scenes from Draft are considered 'Locked' for the viewer
        text_content: segment,
        is_virtual: true,
      });
      sceneIdx++;
    }
    lastIndex = markerRegex.lastIndex;
  }

  // Handle the remaining text after the last marker
  const lastSegment = fullText.substring(lastIndex).trim();
  if (lastSegment) {
    scenes.push({
      id: `v_s${sceneIdx}`,
      idx: sceneIdx,
      title: null,
      status: "LOCKED",
      text_content: lastSegment,
      is_virtual: true,
    });
  }

  // If no markers found at all, return the whole text as scene 1
  if (scenes.length === 0 && fullText.trim()) {
    scenes.push({
      id: "v_s1",
      idx: 1,
      title: "Chapter Content",
      status: "LOCKED",
      text_content: fullText.trim(),
      is_virtual: true,
    });
  }

  return scenes;
}
