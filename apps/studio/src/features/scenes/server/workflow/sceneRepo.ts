import type { Pool } from "pg";
import type { SceneRow, SceneStatus } from "./types";

export class SceneRepo {
  constructor(private pool: Pool) {}

  async getById(id: number): Promise<SceneRow | null> {
    const { rows } = await this.pool.query<SceneRow>(
      `SELECT id, chapter_id, idx, title, status, current_version_id, created_at, updated_at
       FROM public.narrative_scene
       WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async getByKey(chapterId: number, idx: number): Promise<SceneRow | null> {
    const { rows } = await this.pool.query<SceneRow>(
      `SELECT id, chapter_id, idx, title, status, current_version_id, created_at, updated_at
       FROM public.narrative_scene
       WHERE chapter_id = $1 AND idx = $2`,
      [chapterId, idx]
    );
    return rows[0] ?? null;
  }

  async getOrCreate(chapterId: number, idx: number, title?: string | null): Promise<SceneRow> {
    // Note: không thấy unique constraint (chapter_id, idx) trong snippet,
    // nên ta dùng SELECT trước rồi INSERT. Trong tải cao có thể race; nếu muốn harden, thêm unique index sau.
    const existing = await this.getByKey(chapterId, idx);
    if (existing) {
      if (title && !existing.title) {
        await this.pool.query(
          `UPDATE public.narrative_scene SET title = COALESCE(title, $1), updated_at = NOW() WHERE id = $2`,
          [title, existing.id]
        );
        return (await this.getById(existing.id))!;
      }
      return existing;
    }

    const { rows } = await this.pool.query<SceneRow>(
      `INSERT INTO public.narrative_scene (chapter_id, idx, title)
       VALUES ($1, $2, $3)
       RETURNING id, chapter_id, idx, title, status, current_version_id, created_at, updated_at`,
      [chapterId, idx, title ?? null]
    );
    return rows[0]!;
  }

  async setStatus(sceneId: number, status: SceneStatus): Promise<void> {
    await this.pool.query(
      `UPDATE public.narrative_scene SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, sceneId]
    );
  }

  async setCurrentVersion(sceneId: number, versionId: number): Promise<void> {
    await this.pool.query(
      `UPDATE public.narrative_scene SET current_version_id = $1, updated_at = NOW() WHERE id = $2`,
      [versionId, sceneId]
    );
  }
}
