import type { Pool } from "pg";
import { parseSlug } from "./slug";
import { SceneRepo } from "./sceneRepo";
import { VersionRepo } from "./versionRepo";
import { RunRepo } from "./runRepo";
import { assertTransition, isLocked, type SceneStatus } from "./stateMachine";
import type { VersionKind } from "./types";

export class WorkflowEngine {
  private scenes: SceneRepo;
  private versions: VersionRepo;
  private runs: RunRepo;

  constructor(private pool: Pool) {
    this.scenes = new SceneRepo(pool);
    this.versions = new VersionRepo(pool);
    this.runs = new RunRepo(pool);
  }

  async getOrCreateSceneBySlug(slug: string, title?: string | null) {
    const { chapterId, idx } = parseSlug(slug);
    const scene = await this.scenes.getOrCreate(chapterId, idx, title ?? null);
    await this.runs.logRun({
      storyId: scene.story_id,
      sceneId: scene.id,
      step: "intake",
      inputJson: { slug, title },
      outputJson: { scene_id: scene.id, chapter_id: scene.chapter_id, idx: scene.idx },
    });
    return scene;
  }

  async commitVersion(args: {
    slug: string;
    kind: VersionKind;
    textContent?: string | null;
    beatsJson?: unknown | null;
    evalJson?: unknown | null;
    summary?: string | null;
    nextStatus?: SceneStatus;
    step: "outline" | "draft" | "evaluate" | "rewrite";
    llmParams?: Record<string, unknown>;
  }) {
    const { chapterId, idx } = parseSlug(args.slug);
    const scene = await this.scenes.getByKey(chapterId, idx);
    if (!scene) throw new Error(`Scene chua ton tai: ${args.slug}`);
    if (isLocked(scene.status)) throw new Error("Scene dang LOCKED, khong the ghi");
    if (args.nextStatus) assertTransition(scene.status, args.nextStatus);

    const v = await this.versions.createVersion({
      sceneId: scene.id,
      kind: args.kind,
      textContent: args.textContent ?? null,
      beatsJson: args.beatsJson ?? null,
      evalJson: args.evalJson ?? null,
      summary: args.summary ?? null,
    });

    await this.scenes.setCurrentVersion(scene.id, v.id);
    if (args.nextStatus) await this.scenes.setStatus(scene.id, args.nextStatus);

    await this.runs.logRun({
      storyId: scene.story_id,
      sceneId: scene.id,
      step: args.step,
      inputJson: { slug: args.slug, kind: args.kind },
      outputJson: { version_id: v.id, version_no: v.version_no },
      llmParams: args.llmParams ?? {},
      status: "OK",
    });

    return { sceneId: scene.id, versionId: v.id, versionNo: v.version_no, nextStatus: args.nextStatus ?? scene.status };
  }

  async lockScene(slug: string) {
    const { chapterId, idx } = parseSlug(slug);
    const scene = await this.scenes.getByKey(chapterId, idx);
    if (!scene) throw new Error(`Scene chua ton tai: ${slug}`);
    assertTransition(scene.status, "LOCKED");

    await this.scenes.setStatus(scene.id, "LOCKED");
    await this.runs.logRun({
      storyId: scene.story_id,
      sceneId: scene.id,
      step: "lock",
      inputJson: { slug, action: "lock" },
      outputJson: { status: "LOCKED" },
      status: "OK",
    });

    return { sceneId: scene.id, slug, status: "LOCKED" as const };
  }
}
