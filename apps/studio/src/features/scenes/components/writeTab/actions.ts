import type { HeaderContextPayload, SceneItem } from "@/features/scenes/components/writeTab/types";

export function chooseSceneId(items: SceneItem[], requestedSceneId: string | null): string {
  const first = items[0]?.id ? String(items[0].id) : "";
  if (!requestedSceneId) return first;
  return items.some((scene) => String(scene.id) === requestedSceneId) ? requestedSceneId : first;
}

export function buildSeedPrompt(scene: SceneItem | null): string {
  if (!scene) return "";
  return (
    `Write scene for chapter=${scene.chapter_id}, idx=${scene.idx}.\n` +
    "Constraints: third-person limited, grim sci-fi, tight pacing.\n" +
    "If lore is missing, add [TODO: Question] at end.\n"
  );
}

export function buildHeaderContext(scene: SceneItem | null): HeaderContextPayload {
  if (!scene) {
    return {
      chapterLabel: null,
      sceneLabel: null,
      sceneStatus: null,
    };
  }

  return {
    chapterLabel: scene.chapter_id || null,
    sceneLabel: scene.title ? `${scene.title} (#${scene.idx})` : `#${scene.idx}`,
    sceneStatus: scene.status || null,
  };
}
