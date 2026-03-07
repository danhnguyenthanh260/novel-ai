import type { Pool } from "pg";
import type { SceneVersionRow, VersionKind } from "./types";

export class VersionRepo {
  constructor(private pool: Pool) {}

  async getMaxVersionNo(sceneId: number): Promise<number> {
    const { rows } = await this.pool.query<{ max_no: number }>(
      `SELECT COALESCE(MAX(version_no), 0) AS max_no
       FROM public.narrative_scene_version
       WHERE scene_id = $1`,
      [sceneId]
    );
    return Number(rows[0]?.max_no ?? 0);
  }

  async createVersion(args: {
    sceneId: number;
    kind: VersionKind;
    textContent?: string | null;
    beatsJson?: unknown | null;
    evalJson?: unknown | null;
    summary?: string | null;
    versionNo?: number;
  }): Promise<SceneVersionRow> {
    const versionNo = args.versionNo ?? (await this.getMaxVersionNo(args.sceneId)) + 1;

    const { rows } = await this.pool.query<SceneVersionRow>(
      `INSERT INTO public.narrative_scene_version
        (scene_id, version_no, kind, text_content, beats_json, eval_json, summary)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       RETURNING id, scene_id, version_no, kind, text_content, beats_json, eval_json, summary, created_at`,
      [
        args.sceneId,
        versionNo,
        args.kind,
        args.textContent ?? null,
        args.beatsJson ?? null,
        args.evalJson ?? null,
        args.summary ?? null,
      ]
    );
    return rows[0]!;
  }
}
