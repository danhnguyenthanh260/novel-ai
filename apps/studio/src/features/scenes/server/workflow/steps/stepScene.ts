import type { PoolClient } from "pg";
import { getSceneForUpdateById, getSceneForUpdateByWorkunit } from "../repoScene";
import type { SceneRow } from "../types";

export type SceneRefArgs = {
  storyId: number;
  sceneId?: number;
  workunitId?: string;
};

export function sceneRefFromArgs(args: SceneRefArgs): number | string | null {
  return args.sceneId ?? args.workunitId ?? null;
}

export async function resolveSceneForUpdate(client: PoolClient, args: SceneRefArgs): Promise<SceneRow | null> {
  if (typeof args.sceneId === "number") {
    return getSceneForUpdateById(client, { storyId: args.storyId, sceneId: args.sceneId });
  }
  if (typeof args.workunitId === "string") {
    return getSceneForUpdateByWorkunit(client, { storyId: args.storyId, workunitId: args.workunitId });
  }
  return null;
}
