# UI README

Tài liệu ngắn để nắm nhanh kiến trúc `apps/studio/src` hiện tại (multi-story).

For a non-technical, business-first system walkthrough, see [system-business-handbook.md](../../docs/operations/specs/system-business-handbook.md).

## 1) Boundary kiến trúc

- `src/app`: route/page/route-handler của Next App Router.
- `src/features`: business theo domain (story, scenes, workflow).
- `src/server`: hạ tầng server-only (DB pool).
- `src/lib`: helper dùng chung (ví dụ API base).
- `src/features/dictionary`: quản lý từ điển/glossary cho story.

Nguyên tắc: giữ business logic ở `features/*`, route trong `app/api/*` chỉ parse request + gọi workflow/repo.
Lint guard: `features/*/components/*` không được import từ `features/*/server/*`.
Line budget:
- `components/*`: target `<300`, hard cap `500`.
- `server/*`: target `<250`, hard cap `400`.
Refactor direction for large modules:
- Components: split into `PageContainer`, `View`, `hooks`, `actions`, `types/mappers`.
- Server pipeline: split into `service`, `validators`, `repo/db`, `policy/decision`, `dto mapper`.

## 2) Entry points quan trọng

- Layout shell + story selector: `src/app/layout.tsx`, `src/components/AppShell.tsx`
- Story context và settings:
  - `src/features/story/StoryContext.tsx`
  - `src/features/story/StorySelector.tsx`
  - `src/features/story/StorySettingsForm.tsx`
- Ingest monitor:
  - `src/app/stories/[slug]/ingest/page.tsx`
  - `src/app/stories/[slug]/ingest/maturity/page.tsx`
  - `src/features/ingest/components/IngestJobsClient.tsx`
  - `src/features/ingest/components/IngestMaturityClient.tsx`
  - Includes split-draft preview + approve/reject flow for auto scene split
- Review panel:
  - `src/app/stories/[slug]/reviews/page.tsx`
  - `src/features/reviews/components/ReviewPanelClient.tsx`
- Scenes UI:
  - `src/app/scenes/page.tsx`
  - `src/app/scenes/[sceneId]/page.tsx`
  - `src/app/stories/[slug]/write/page.tsx`
  - `src/features/scenes/components/ScenesPageClient.tsx`
  - `src/features/scenes/components/SceneDetailClient.tsx`
  - `src/features/scenes/components/DraftRunner.tsx`
  - `src/features/scenes/components/writeTab/NovelLabWorkspace.tsx` (Novel Lab command/artifact Write slice)
- Dictionary & Shelf:
  - `src/features/dictionary/components/DictionaryManager.tsx`
  - `src/app/shelf/page.tsx`
  - `src/app/read/[storySlug]/page.tsx`

## 3) API hiện tại

### Canonical (đang dùng cho multi-story)

- `GET /api/[storySlug]/scenes`
- `GET /api/[storySlug]/scenes/[sceneId]/versions`
- `POST /api/[storySlug]/scenes/[sceneId]/commit-draft`
- `POST /api/[storySlug]/scenes/intake`
- `POST /api/[storySlug]/scenes/outline`
- `POST /api/[storySlug]/scenes/draft`
- `POST /api/[storySlug]/scenes/evaluate`
- `POST /api/[storySlug]/scenes/rewrite`
- `POST /api/[storySlug]/scenes/lock`
- `POST /api/[storySlug]/autowrite/run` (AutoWrite v2: Beat-based orchestrator, generates to Staging)
- `GET /api/[storySlug]/scenes/full` (Published/Staging fusion with Staging Lockout)
- `POST /api/[storySlug]/scenes/stage` (Write current chapter to staging table)
- `POST /api/[storySlug]/scenes/execute` (Verify staging health via Historian)

### Story management

- `GET /api/stories`
- `POST /api/stories`
- `GET /api/stories/[slug]`
- `PATCH /api/stories/[slug]`
- `GET /api/shelf` (published-only story cards)
- `GET /api/stories/[slug]/public` (published story detail for reader/landing)
- `GET /api/stories/[slug]/chapters` (published story chapters list)
- `GET /api/stories/[slug]/chapters/[chapterId]/read` (published reader payload by chapter)
- `GET /api/stories/[slug]/chapters/[chapterId]/writing-status?job_id=<id>` (poll async AutoWrite chapter job status + staging readiness)
  - includes `historian_snapshot` when available (`fact_status`, `narrative_score`, `emotional_target`, `open_loops`, `lore_debt`, `snapshot_v3`)
- `GET /api/stories/[slug]/meta` (editor/admin story meta)
- `PATCH /api/stories/[slug]/meta` (update library status, markdown, tags, cautions)
- `POST /api/stories/[slug]/assets/cover` (multipart upload `file` or `cover_file`)
- `POST /api/stories/[slug]/assets/background` (multipart upload `file` or `background_file`)
- `POST /api/stories/[slug]/assets/gallery` (multipart upload `files[]` or `gallery_files[]`)
- `DELETE /api/stories/[slug]/assets/[imageId]`
- `GET /api/story-assets/[...segments]` (serve local disk assets by relative path)

### Ingest (Memory Bridge)

- `POST /api/[storySlug]/ingest/validate`
- `POST /api/[storySlug]/ingest/jobs`
- `GET /api/[storySlug]/ingest/jobs`
- `PATCH /api/[storySlug]/ingest/jobs` (cancel/retry actions)
- `GET /api/[storySlug]/ingest/jobs/[jobId]/split-draft`
- `POST /api/[storySlug]/ingest/jobs/[jobId]/approve-split`
- `POST /api/[storySlug]/ingest/jobs/[jobId]/chapters/[chapterTaskId]/approve-split`
- `POST /api/[storySlug]/ingest/jobs/[jobId]/reject-split`
- `POST /api/[storySlug]/ingest/maturity-report` (returns 7/14/30-day split maturity metrics; supports `process_legacy=true` to patch legacy split fields before reporting)
- `POST /ingest/validate` và `POST /ingest/jobs` hỗ trợ `multipart/form-data`:
  - `mode=ZIP_UPLOAD` + `zip_file` (binary zip)
  - `mode=MEGA_FILE` + `mega_file` (text file UTF-8)
  - `split_mode=manual|auto`
    - `manual`: bắt buộc scene delimiter trong chapter
    - `auto`: không yêu cầu delimiter, worker split bằng LLM
- `POST /ingest/jobs` (auto-split path) sẽ tạo `source_doc` (SSOT raw text) theo chapter trước khi enqueue split task.
- `POST /ingest/jobs` auto-start worker backend (best effort) để ingest có thể chạy nền ngay sau khi bấm tạo job.
- `POST /ingest/jobs/[jobId]/approve-split` enqueue `SCENE_CREATE` theo pointer (`source_doc_id + start/end`) để tránh nhân bản chapter text trong task payload.
  - hỗ trợ `chapter_task_id` để approve theo từng chapter split task; UI có thể loop `Approve All`.
  - nếu không truyền `approved_scenes`, API fallback dùng scenes trong `split_task.result_json`.
- `POST /ingest/jobs/[jobId]/chapters/[chapterTaskId]/approve-split` là endpoint chuyên biệt cho flow approve theo chapter task.
- `GET /ingest/jobs/[jobId]/split-draft` trả `split_draft.chapters[]` cho preview multi-chapter first-class.
- Split runtime contract:
  - `split_runtime.runbook_hint_code` for artifact triage may be:
    - `RUNBOOK_SPLIT_ARTIFACT_OVERSIZED`
    - `RUNBOOK_SPLIT_ARTIFACT_COVERAGE_GAP`
    - `RUNBOOK_SPLIT_ARTIFACT_NOT_READY` (legacy/fallback)
  - `split_runtime` may include fallback/degrade observability fields:
    - `pipeline_version` (`v1|v2`)
    - `degrade_path_taken` (`boolean`)
    - `degrade_reason_code` (for example `BUDGET_DEGRADE_PATH_TAKEN`)
    - `deterministic_fallback_applied` (`boolean`)
    - `deterministic_fallback_notes` (`string[]`)
  - `split_runtime` may include prompt/budget orchestration diagnostics:
    - `constraint_pack_mode` (`full|trimmed|minimal_long_chapter`)
    - `constraint_pack_stats`
      - `raw_constraints_count`
      - `dedup_constraints_count`
      - `injected_constraints_count`
      - `dropped_low_priority_count`
    - `latency_adaptive_triggered` (`boolean`)
    - `latency_source_window` (`sample_size`, `p50_ms`, `p75_ms`)
  - UI should combine `runbook_hint_code` with `analysis_chunk_diagnostics.oversized_count`
    (fallback `analysis_chunk_artifact.diagnostics.oversized_count`) to render operator guidance accurately.
  - Split quality payload may include:
    - `quality_report.hard_fail_reason_codes` (normalized list of hard-fail taxonomy codes)
    - `quality_report.hard_fail_signals` (machine-readable gate signals + diagnostics warnings)
    - `reason_codes` at chapter-result level (quality + artifact reasons, fallback-safe)
      - examples: `BUDGET_DEGRADE_PATH_TAKEN`, `OVERSIZED_DETERMINISTIC_SPLIT_APPLIED`, `OVERSIZED_DETERMINISTIC_SPLIT_FALLBACK`, `DIALOGUE_ATTRIBUTION_GUARD_HIT`

### Review (Memory Bridge)

- `GET /api/[storySlug]/reviews`
- `POST /api/[storySlug]/reviews` (`submit_response`, `apply_response`)
- `apply_response` bridge Human + AI score:
  - `human_overall` từ `review_response.scores_json`
  - `ai_overall` từ `narrative_scene_version.eval_json.overall`
  - `fused_overall = 0.7*human + 0.3*ai`
  - decision `LOCK` hoặc `REWRITE` (scene status `LOCKED` hoặc `EVALUATED`)

### Worldbuilding + Style Profile (Author Stage 1)

- `GET/POST/PATCH/DELETE /api/[storySlug]/worldbuilding`
  - filter `category`, `injection_mode`, `q`, `limit`
  - `include_full=1` để trả full `content`; mặc định trả `preview`
- `GET/PUT /api/[storySlug]/style-profile`
  - fallback default profile nếu story chưa có row
  - range fields chuẩn hóa về `0..100`

### Canon Guard

- `POST /api/[storySlug]/guard/preflight`
- `draft` và `rewrite` step (server workflow) luôn chạy preflight guard trước khi ghi version/log.
- Shared builder: `src/features/guard/server/storyContextBuilder.ts` (pack `canon/timeline/style` dùng chung cho Guard + Muse).
- `rewrite` mode `llm` inject `CANON/RELATIONSHIPS/RECENT EVENTS/UNCERTAIN` block vào text rewrite.
- Khi guard có uncertainty, rewrite `llm` tự thêm fallback `[TODO: Question]`.
- Guard output mở rộng:
  - `GLOBAL_CONTEXT`: `STYLE_PROFILE`, `WORLDBUILDING_CORE`, `WORLDBUILDING_TAGGED`
  - `LOCAL_CONTEXT`: `CANON`, `RELATIONSHIPS`, `RECENT EVENTS`, `UNCERTAIN`
- `POST /api/pipeline/draft/stream` sẽ tự inject guard context nếu có `story_slug`

### LLM streaming

- `POST /api/pipeline/draft/stream` (proxy SSE tới `LLM_API_BASE`)
- `POST /api/muse/stream` (Ghost Muse SSE, mode `bullets|block`)
- `POST /api/muse/chat/compress` (Chapter compress, JSON strict non-stream, soft limit 350KB)
- `POST /api/muse/chat/synthesis` (Muse Chat synthesis, JSON strict non-stream)
- `POST /api/muse/chat/prose` (Muse Chat prose, non-stream)

### Dictionary

- `GET /api/[storySlug]/dictionary`
- `POST /api/[storySlug]/dictionary`
- `PATCH /api/[storySlug]/dictionary/[id]`
- `DELETE /api/[storySlug]/dictionary/[id]`

### Legacy compatibility
Chỉ giữ để tương thích tạm thời.

## 4) Workflow scenes (server)

Code: `src/features/scenes/server/workflow/*`

State machine:

- `DRAFTING -> DRAFTED -> EVALUATED -> REVISED -> EVALUATED ...` (Scene level)
- `STAGED -> VERIFIED -> COMMITTED` (Chapter level - AutoWrite v2)
- Từ mọi trạng thái mở có thể `-> LOCKED`
- `LOCKED` là trạng thái cuối, chặn write
- **Navigation Rule**: Ch12+ sử dụng URL-first persistence (`?chapter_id=...`).

Các step chính:

- `intake`: tạo scene theo `workunit_id`
- `outline`: tạo version kind `outline`, giữ status `DRAFTING`
- `draft`: tạo version kind `draft`, chuyển `DRAFTED`
- `draft`: luôn lấy canon guard context trước khi tạo version
- `evaluate`: ghi `eval_json` lên current version, chuyển `EVALUATED`
- `rewrite`: tạo version kind `rewrite`, chuyển `REVISED`
- `rewrite`: luôn lấy canon guard context; mode `llm` inject guard block + fallback TODO khi thiếu certainty
- `lock`: chuyển scene sang `LOCKED`

Mỗi step ghi log vào `narrative_pipeline_run`.

Memory layer async (worker):

- Trigger sau mỗi lần insert `narrative_scene_version`.
- Worker poll `memory_enrich_task` để tạo pack extract-only:
  - `canon_fact`
  - `timeline_anchor`
  - `style_profile_scene`
- Idempotency theo `(scene_version_id, algo_version)` để tránh enrich trùng.

## 5) Data model liên quan

Migration cần đọc khi sửa logic:

- `db/migrations/001_ui_pipeline.sql` (nền tảng cũ)
- `db/migrations/003_multi_story_foundation.sql` (thêm `story_series`, `story_id`, `workunit_id`)
- `db/migrations/004_multi_story_scene_version_story_id.sql` (thêm `story_id` cho version)
- `db/migrations/005_memory_bridge_foundation.sql` (canon/ingest/review)
- `db/migrations/006_review_apply_policy_fields.sql` (review decision fields)
- `db/migrations/007_fix_scene_unique_scope.sql` (unique scope theo story)
- `db/migrations/008_author_stage1_global_memory.sql` (worldbuilding + style profile)
- `db/migrations/010_shelf_library_foundation.sql` (library metadata + tags/cautions/images)
- `db/migrations/011_story_background_image.sql` (background image path)
- `db/migrations/015_source_doc_ssot.sql` (ingest source doc SSOT, hash/idempotency base)
- `db/migrations/016_memory_layer_v1.sql` (async memory packs: canon/timeline/style + enrich queue)
- `db/migrations/023_author_style_profile.sql` (ingest-mined author style profile memory)

Thực thể chính:

- `story_series`
- `narrative_scene`
- `narrative_scene_version`
- `narrative_pipeline_run`
- `timeline_event`
- `DATABASE_URL`
- `LLM_API_BASE`
- `LLM_MODEL`
- `LLM_API_KEY`
- `WRITING_V2_PRODUCTION` (optional, default `1`; set `0` to disable `/stories/[slug]/chapters/*` AutoWrite v2 plan/execute/status endpoints during rollout/rollback)
- `WRITING_COOL_OFF_SECONDS` (optional, default `2`; controls cool-off between `NARRATIVE_*` tasks for chapter writing)
- `LLAMA_MANUAL_ONLY` (optional, default `1`; when enabled, `/ingest/worker` API will not start/stop llama-server and expects manual terminal operation)
- `NEXT_PUBLIC_MUSE_CHAT_ENABLED` (optional, `1/true` để bật Muse Chat mode trong Assist)
- `STORY_ASSET_ROOT` (optional, default `../storage` from `apps/studio/` process cwd)
- `INGEST_AUTO_START_WORKER` (optional, default `1`; set `0` để tắt auto-start worker)
- `MEMORY_WORKER_PYTHON` (optional; default `<repo>/.venv/bin/python`, fallback `python3`)
- `MEMORY_WORKER_PID_FILE` (optional; default `<repo>/.runtime/memory_worker.pid`)
- `HISTORIAN_MCP_BASE_URL` (optional; MCP hub base URL for Grand Historian external adapters)
- `HISTORIAN_QDRANT_ENABLED` (optional, default `0`; enable Qdrant-style semantic adapter in `WRITING_ANALYSIS`)
- `HISTORIAN_NEO4J_ENABLED` (optional, default `0`; enable Neo4j-style lineage adapter in `WRITING_ANALYSIS`)
- `HISTORIAN_CONTEXT_EXTERNAL_ENABLED` (optional, default `0`; enable external Neo4j/Qdrant retrieval in `storyContextBuilder`)
- `HISTORIAN_CONTEXT_NEO4J_ENABLED` (optional, default `0`; call MCP Neo4j neighborhood endpoint for `relationshipLines`)
- `HISTORIAN_CONTEXT_QDRANT_ENABLED` (optional, default `0`; call MCP Qdrant semantic endpoint for `worldTaggedLines`)
- `HISTORIAN_CONTEXT_TIMEOUT_MS` (optional, default `350`; per-call timeout for each external retrieval)
- `HISTORIAN_CONTEXT_TOTAL_BUDGET_MS` (optional, default `800`; shared deadline budget for combined external retrieval)
- `HISTORIAN_CONTEXT_QDRANT_THRESHOLD` (optional, default `0.65`; semantic relevance gate for Qdrant matches)
- `HISTORIAN_CONTEXT_QDRANT_TOP_K` (optional, default `12`; top semantic matches requested from Qdrant)
- `HISTORIAN_CONTEXT_NEO4J_LIMIT` (optional, default `15`; max relationship edges requested from Neo4j)
- `HISTORIAN_CONTEXT_CAST_LIMIT` (optional, default `12`; max cast entities passed to Neo4j neighborhood query)
- `HISTORIAN_CONTEXT_QDRANT_QUERY_CHARS` (optional, default `1000`; local prose tail chars used to synthesize semantic query)
- `LLM_TIMEOUT_HISTORIAN_QDRANT` (optional, seconds; default `12`)
- `LLM_TIMEOUT_HISTORIAN_NEO4J` (optional, seconds; default `12`)

Run:

```bash
npm install
npm run dev
npm run doctor:split-maturity -- --story <story_slug>
npm run doctor:split-maturity -- --story <story_slug> --process-legacy
npm run doctor:split-feedback-insights -- --story <story_slug> --days 30
npm run doctor:split-guardrail -- --baseline ../../benchmarks/split_benchmark_baseline.json --golden ../../benchmarks/split_golden_set.json --thresholds ../../benchmarks/split_guardrail_thresholds.json
npm run doctor:split-weekly-review -- --story <story_slug> --days 7
npm run doctor:supervisor-casebook -- --story <story_slug> --days 7
npm run doctor:style-profile-mine -- --story <story_slug>
```

## 7) Checklist cập nhật tài liệu

Khi tính năng mới đã confirm hoàn chỉnh:

1. Cập nhật mục API nếu có route mới/đổi contract.
2. Cập nhật workflow/state nếu thay transition.
3. Cập nhật mục entry points nếu thêm module chính.
4. Xóa mô tả cũ hoặc deprecated không còn dùng.

## 8) UI Source Of Truth (Design Consistency)

This section is the canonical UI reference for Map/Write surfaces until a separate token file is introduced.

Primary references:

1. `docs/architecture/ui-information-architecture.md` (surface ownership and Write IA)
2. `docs/architecture/conversational-command-orchestrator.md` (Novel Lab command/control contract)
3. `docs/architecture/conversational-command-mvp-map.md` (MVP slash command mapping)
4. `apps/studio/src/features/scenes/components/writeTab/NovelLabWorkspace.tsx` (current Novel Lab Write workspace composition)
5. `apps/studio/src/features/scenes/components/writeTab/CommandWorkStream.tsx` (center command/task stream)
6. `apps/studio/src/features/scenes/components/writeTab/ArtifactSurface.tsx` (right artifact editor/review surface)
7. `apps/studio/src/features/scenes/components/writeTab/ArtifactInspectorRail.tsx` (right inspector summary rail)
8. `apps/studio/src/features/map/components/MapPageClient.tsx` (current map UX patterns)
9. `apps/studio/README.md` section 8 (visual rules below)

### Visual rules (must follow)

- Grid: 8px scale (`4/8/12/16/24`)
- Spacing:
  - `p-2`: compact controls only
  - `p-3`: small cards/list items
  - `p-4`: default section/card container
  - `p-6`: page container
- Gaps: `gap-2`, `gap-3`, `gap-4` only

### Typography rules

- UI language: English-first (Vietnamese helper text only for glossary/help)
- Body: 14px (`text-sm`)
- Labels/meta: 12px (`text-xs`)
- Section title: 16px (`text-base`)
- Page title: 20px (`text-xl`)

### Color rules (dark-first current app)

- App background: `#0B0F14`
- Surface: `#111827`
- Border: `#2A3441`
- Text primary: `#E5E7EB`
- Text secondary: `#9CA3AF`
- Success: `#22C55E`
- Warning: `#F59E0B`
- Error: `#EF4444`
- Info: `#38BDF8`

### Interaction rules

- Destructive import must keep 2-step confirm + `REPLACE`
- `MAP_LOCKED` blocks all map writes, but export remains enabled
- Show state badge clearly: `DRAFT` / `COMMITTED` / `LOCKED`
- Use one `busy` state to prevent double-submit on header actions
- Novel Lab Write uses `Context Clean` -> `proceed`, `Context Partial` -> `degraded`, and `Context Blocked` -> `blocked`.
- The center work stream owns commands, task progress, and result summaries only; long generated prose belongs in the right artifact workspace.
- Slash commands appear from the composer when invoked, not as a permanent command palette.
- The right artifact workspace owns editable prose, review actions, and the inspector rail.
- `Approve revision` stays locked until continuity validation passes; `Run continuity check` is primary while validation is pending.

## 9) UI Philosophy (Global)

Mục tiêu UI của web này là: **Story-first Studio**.
UI phải giúp người viết tập trung vào tiến độ truyện, không giống dashboard kỹ thuật.

### Design principles

- `Focus over clutter`: giảm noise, ưu tiên 1 action chính mỗi vùng.
- `Narrative rhythm`: hierarchy rõ theo nhịp đọc/viết (title -> context -> action).
- `System confidence`: trạng thái phải nhìn ra ngay (locked/draft/error).
- `English-first clarity`: label chính dùng tiếng Anh đơn giản; chỉ thêm tiếng Việt ở trợ giúp.

### Visual direction

- Tone: cinematic technical (teal + amber accent), không dùng tím mặc định.
- Background: layered gradient, không dùng nền phẳng.
- Surface: card có depth nhẹ, border mềm.
- Motion: hover nâng nhẹ, không animation phức tạp.

### Typography direction

- Sans: `Space Grotesk` (UI text)
- Mono: `JetBrains Mono` (code/json/ids)
- Tránh dùng default stack kiểu `Arial/Roboto` làm font chính.

### Spacing direction

- Hệ lưới 8px: `p-2/p-3/p-4/p-6` theo mật độ.
- Header controls giữ compact (`p-2`), nội dung chính dùng `p-3` hoặc `p-4`.

### Component contract

- App shell controls dùng class semantic:
  - `shell-control`
  - `shell-link`
- Surface block dùng:
  - `surface-card`
- Status dùng pill semantic:
  - `status-pill--locked`
  - `status-pill--drafting`
  - `status-pill--other`

Khi làm UI mới (Write/Map/Ingest/Reviews), ưu tiên tái dùng semantic class + token hiện có trong `src/app/globals.css` thay vì tự chọn màu ad-hoc.

## 10) Reorg Update (2026-02-19)

Latest refactor status:

- Thin-route pass completed for active API domains.
- Worker boundary cleanup completed:
  - `services/memory-bridge/worker_text_repair.py`
  - `services/memory-bridge/worker_split_quality.py`
  - `services/memory-bridge/worker_profile_learning.py`
  - `services/memory-bridge/worker_ingest_repo.py` (ingest/memory task SQL lifecycle + scene persistence helpers)
  - `services/memory-bridge/worker_memory_pack.py` (memory extraction/normalization pipeline)
  - `services/memory-bridge/worker_task_handlers.py` (chapter/scene task handlers and indexing flow)
  - `services/memory-bridge/worker_split_proposal.py` (manual/auto split proposal builders and strategy-profile update flow)
  - `services/memory-bridge/worker_split_boundary_helpers.py` (split boundary candidate/extraction and window-rerun helper primitives)
  - `services/memory-bridge/worker_split_refine.py` (boundary scoring/refine/normalize + semantic-resplit guard flow)
  - `services/memory-bridge/memory_bridge_worker.py` keeps stable task-handler contracts.
- Prompt/context consolidation completed:
  - `apps/studio/src/features/prompts/server/musePromptBuilder.ts`
  - `apps/studio/src/features/prompts/server/autowritePromptBuilder.ts`
- Current change-impact references:
  - `docs/architecture/change-impact-map.md`
  - `docs/planning/code-ownership-map.md`

## 11) Reorg Update (2026-02-22)

- Cập nhật tài liệu cấu trúc cho tính năng Dictionary.
- Làm rõ các route `shelf` (thư viện) và `read` (chế độ đọc).
- Loại bỏ các tham chiếu đến folder `packages` không còn tồn tại ở root.

Verification commands used in this cycle:
...

Verification commands used in this reorg cycle:

```bash
# UI gates
cd apps/studio
npm run build
npm run typecheck

# Python compile gate
cd ..
python3 -m py_compile services/memory-bridge/memory_bridge_worker.py services/memory-bridge/worker_text_repair.py services/memory-bridge/worker_split_quality.py services/memory-bridge/worker_profile_learning.py
```

Doctor scripts note:

- Most doctor scripts default to `API_BASE=http://localhost:3001`.
- If local UI/API runs on port `3000`, set `API_BASE` explicitly:

```bash
cd apps/studio
API_BASE=http://localhost:3000 node scripts/doctor_ingest_validate.mjs
```
