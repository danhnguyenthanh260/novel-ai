# PROMPT: GPT Staff-Engineer Challenge (Stage 2) — với code thật

> Dán TOÀN BỘ nội dung dưới đây cho GPT. GPT không có quyền truy cập repo, nên
> mọi ngữ cảnh + code cần thiết đã được nhúng sẵn. Nhiệm vụ của GPT là CHALLENGE
> (phản biện), không phải approve.

---

## VAI TRÒ

Bạn là **Staff Engineer** review một bản Stage-1 investigation về repo `novel-ai`. Mục tiêu: **tìm điểm yếu** — assumption sai, edge case thiếu, over/under-engineering, risk bị bỏ sót, và **refute root-cause nếu có bằng chứng ngược**. Không được "gật đầu cho qua". Nếu một khẳng định đúng, nói ngắn gọn "đúng"; nếu sai/thiếu, chỉ rõ chỗ sai kèm lý do kỹ thuật. Bạn được cung cấp code thật bên dưới — hãy challenge dựa trên code, không chỉ dựa trên diễn giải.

## NGỮ CẢNH REPO

`novel-ai` = chapter-first AI writing studio (tự host, hiện coi như single-user/localhost). 852 file, ~100k LOC. Ba lớp:
- `apps/studio` — Next.js 16 / React 19 / TS / Tailwind 4: UI + 152 API route (`route.ts`).
- `services/memory-bridge` — Python 3.12 worker (psycopg2): queue, ingest, split, memory, writing pipeline.
- `db/migrations` — PostgreSQL 15 (~90 bảng). Postgres là source of truth.
- Hạ tầng phụ: Neo4j 5 + Qdrant 1.13 (qua `infra/historian_mcp_bridge.py`), LLM qua endpoint OpenAI-compatible (`LLM_API_BASE`).
- Kênh FE→worker = bảng Postgres `ingest_task` (không phải HTTP/Redis). Worker là child process của Node server, bind `127.0.0.1`, 1 process/lane (flock).

## 5 KHẲNG ĐỊNH CẦN BẠN CHALLENGE (kèm code)

### R1 (ROOT CAUSE) — Lớp knowledge (Neo4j + Qdrant) là "facade": tồn tại nhưng KHÔNG được nối dây trong pipeline chạy thật.

Bằng chứng 1 — helper projection Neo4j được định nghĩa nhưng KHÔNG NƠI NÀO GỌI (`services/memory-bridge/worker_task_handlers.py:109`):
```python
def _sync_neo4j_projection(story_id: int, static_facts: list[Dict[str, Any]]) -> Dict[str, Any]:
    enabled = str(os.getenv("HISTORIAN_NEO4J_ENABLED", "0")).strip().lower() in ("1","true","yes","on")
    base = str(os.getenv("HISTORIAN_MCP_BASE_URL", "")).strip().rstrip("/")
    if not enabled: return {"status": "disabled", "reason": "HISTORIAN_NEO4J_ENABLED_OFF"}
    if not base:    return {"status": "disabled", "reason": "HISTORIAN_MCP_BASE_URL_MISSING"}
    payload = {"story_id": int(story_id), "facts": static_facts[:HISTORIAN_PROJECTION_STATIC_LIMIT]}
    res = _http_post_json(f"{base}/v1/historian/neo4j-upsert", payload, timeout_sec=25)
    ...
```
`grep -rn '_sync_neo4j_projection' services/memory-bridge` trả về **chỉ dòng 109 (def)** — không có call-site.

Bằng chứng 2 — Qdrant chỉ được SEARCH, không có nơi nào WRITE point (`infra/historian_mcp_bridge.py:158`):
```python
f"{QDRANT_URL}/collections/{collection}/points/search",   # chỉ có /points/search
```
`grep -rn '/points' services infra scripts --include=*.py` → chỉ có `/points/search`, không có `/points/upsert`. Collection `narrative_swas_memory` được tạo bởi `scripts/init_historian_db.py` nhưng không có producer.

Bằng chứng 3 — vector search THẬT chạy bằng cosine trong Postgres (`agent_memory_vector.embedding_json`), không phải Qdrant (`worker_narrative_handlers.py:79-196` dùng `cosine_similarity`). Retrieval/context builder (`apps/studio/src/features/guard/server/storyContextBuilder.ts:805,849`) đọc graph + Qdrant collection rỗng và fallback im lặng.

**Challenge:** R1 có đúng là root-cause không, hay chỉ là feature-flag OFF cố ý (`HISTORIAN_NEO4J_ENABLED` default 0) và có call-site tớ bỏ sót? Nếu graph/Qdrant rỗng, `storyContextBuilder` có thực sự trả context tệ hơn không, hay nó có nguồn dữ liệu khác bù vào? Việc "build tiếp vs cắt bỏ" nên quyết dựa trên tiêu chí nào?

### R2 — 152 route API không auth + SSRF qua `PUT /api/llm/provider`.

`apps/studio/src/app/api/llm/provider/route.ts` (không có auth/middleware):
```ts
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const provider = await writeRuntimeProviderConfig(body);   // ghi baseUrl+apiKey tùy ý vào file runtime
  return NextResponse.json({ provider });
}
export async function POST() {                                 // health-check: server fetch baseUrl kèm Bearer
  const { config } = await getActiveLlmProviderConfig();
  const health = await runLlmProviderHealthCheck(config);
  ...
}
```
Validation duy nhất (`llmProviderProfiles.ts:126`):
```ts
if (!/^https?:\/\//i.test(config.baseUrl)) return "Base URL must start with http:// or https://.";
```
Không có host allowlist. Kẻ tấn công đặt `baseUrl` = host nội bộ → server SSRF; hoặc đặt endpoint độc → bắt toàn bộ prompt/story.

**Challenge:** Với giả định "localhost single-user", R2 có phải chỉ là ghi chú (không phải blocker) không? Ranh giới nào biến nó thành blocker? Có vector tấn công nào ngay cả trên localhost (vd CSRF từ browser → `PUT` same-origin, DNS-rebinding) mà report chưa nêu?

### R3 — Queue chính không retry + LLM call fail-open.

LLM call trả rỗng thay vì raise (mặc định `raise_on_error=False`) — `worker_common.py:~380`:
```python
except urllib.error.HTTPError as e:
    ...
    if raise_on_error: raise RuntimeError(...)
    return {}          # <-- nuốt lỗi, trả {} => task vẫn "thành công" với kết quả rỗng
```
Queue chính `ingest_task` chỉ có trạng thái terminal FAILED, không requeue (`worker_ingest_repo.py:711` `mark_task_failed` set `status='FAILED'`), trong khi queue `memory_enrich_task`/`agent_janitor_task` CÓ `retry_count` + `available_at = now()+60s`.

**Challenge:** Terminal-on-failure cho queue chính có thể là chủ ý (app/UI tự re-enqueue)? Nếu đổi `raise_on_error` mặc định = True, những latent failure nào sẽ lộ ra (regression rủi ro)? Có nên phân biệt lỗi retry-được (5xx/timeout) vs không (4xx/parse)?

### R4 — 3 engine autowrite song song + 2 API namespace.

`CHAPTER_WRITE_V3` (queue), `NARRATIVE_*` (legacy, tắt trừ khi `NARRATIVE_LEGACY_DISPATCH_ENABLED=1`), và loop critic in-process `autowriteRunService.ts`. Namespace `/api/stories/[slug]/*` và `/api/[storySlug]/*` trùng.

**Challenge:** Có bằng chứng nào cho thấy đây là migration có chủ đích (đang dọn dần) thay vì debt? Việc gộp có rủi ro xóa nhầm path đang được production dùng không? Thứ tự an toàn để consolidate?

### R5 — Provider config split-brain.

UI selector ghi file runtime `.runtime/llm-provider.json`, nhưng đường generate THẬT đọc env thô (`api/muse/_shared.ts:288`):
```ts
const llmBase = process.env.LLM_API_BASE!;
const apiKey  = process.env.LLM_API_KEY ?? "local";
const payload = { model: process.env.LLM_MODEL ?? "qwen2.5-7b", ... };
```
Python worker cũng chỉ đọc env. → Đổi provider trên UI không đổi thứ đang generate.

**Challenge:** Đây là bug hay thiết kế (file runtime chỉ cho health-check)? Thống nhất về "một nguồn sự thật" có rủi ro gì (vd worker Python không đọc được file JS)?

## MASTER PLAN CẦN BẠN CHẤT VẤN THỨ TỰ

Sprint 0: chốt product-truth (Neo4j/Qdrant build hay cắt) → Sprint 1: CI gate + test cho file logic nặng → Sprint 2: reliability (retry/backoff + raise_on_error + job-status) → Sprint 3: thực thi quyết định knowledge layer → Sprint 4: gộp autowrite path + API namespace + provider → Sprint 5: hardening (auth, migration ledger, FK, UI status thật, logging).

**Challenge thứ tự:** Sprint 0 có đúng là chặn mọi thứ không? Có sprint nào nên đảo lên trước (vd R3 reliability trước CI)? Thiếu hạng mục nào? Sprint nào over-engineering cho một dự án cá nhân single-user?

## ĐỊNH DẠNG OUTPUT MONG MUỐN TỪ BẠN (GPT)

1. Với mỗi R1–R5: `[GIỮ NGUYÊN | SỬA | BÁC BỎ]` + lý do kỹ thuật (kèm giả định của bạn).
2. Edge case / risk report bỏ sót.
3. Chỗ over- hoặc under-engineering (nhớ: dự án cá nhân, single-user).
4. Đánh giá lại thứ tự Sprint 0–5 + đề xuất thứ tự của bạn.
5. Trả lời (nếu có góc nhìn) cho các câu hỏi mơ hồ: build-or-cut knowledge layer, deployment scope.
6. Kết: 3 rủi ro lớn nhất mà report ĐÁNH GIÁ SAI mức độ (nếu có).
