
# novel-ai

`novel-ai` là một chapter-first AI writing studio để tạo, ingest, phân tích, review, split và xuất bản truyện dài kỳ trong một workspace thống nhất. Repo này kết hợp:

- `apps/studio`: giao diện và API bằng Next.js
- `services/memory-bridge`: worker Python xử lý ingest, memory, split và writing pipeline
- `db/migrations`: schema SQL và các migration theo tính năng
- `infra`: Docker Compose cho PostgreSQL, Neo4j, Qdrant, Historian bridge, Grafana và bản build production-like của Studio

Nếu bạn muốn hiểu nhanh theo góc nhìn business, xem thêm [docs/operations/specs/system-business-handbook.md](./docs/operations/specs/system-business-handbook.md).

## Tech Stack

- Frontend / API: Next.js 16, React 19, TypeScript, Tailwind CSS 4
- Database: PostgreSQL 15
- Knowledge / retrieval: Neo4j 5, Qdrant 1.13
- Worker / pipeline: Python 3.12, psycopg2
- Infrastructure: Docker Compose, Grafana
- LLM integration: OpenAI-compatible API endpoint qua `LLM_API_BASE` (mặc định `http://localhost:8080/v1`; Groq/dev provider setup ở [docs/operations/llm-providers.md](./docs/operations/llm-providers.md))

## Mục tiêu của repo

Hệ thống được tổ chức xoay quanh chapter là đơn vị làm việc chính. Người dùng có thể:

- Tạo và quản lý nhiều story trong cùng một studio
- Ingest chapter đã có sẵn, split thành scene, duyệt kết quả split
- Draft, rewrite, review, stage và verify chapter mới
- Theo dõi pipeline, memory, analysis, map và agents trên từng story
- Phát hiện continuity/canon issues trước khi đưa nội dung vào vòng viết tiếp

## Kiến trúc tổng quan

Ba lớp quan trọng nhất:

1. `apps/studio`: UI và HTTP API cho shelf, stories, ingest, write, reviews, memory, analysis, map, agents
2. `services/memory-bridge`: worker nền xử lý task queue, memory enrich, split quality, writing analysis và chapter workflow
3. `db/migrations`: lịch sử schema cho story, scenes, ingest, review, global memory, map, agents và truth-pack governance

## Cấu trúc thư mục

```text
.
|- apps/studio/              # Next.js studio UI + API routes
|- services/memory-bridge/   # Python worker cho ingest/memory/writing pipeline
|- services/moltbook/        # Tài liệu agent phụ trợ
|- db/migrations/            # SQL migrations theo thứ tự
|- docs/operations/          # Handbook, runbook, specs vận hành
|- infra/                    # docker-compose và historian_mcp_bridge.py
|- prompts/examples/         # Prompt examples
|- scripts/                  # Script chẩn đoán DB và vận hành
|- tools/doctor/             # Doctor tooling
|- experiments/notebooks/    # Thử nghiệm
|- .runtime/                 # PID/lock local runtime (không phải source of truth)

```

## Prerequisites

Bạn nên cài sẵn:

* Node.js `20.x`
* `npm`
* Python `3.12+`
* Docker Desktop / Docker Compose v2
* `psql` client để apply migration
* Một OpenAI-compatible LLM endpoint (ví dụ `llama-server`) tại `LLM_API_BASE`

## Cài đặt

### Cách khuyên dùng cho dev: Docker cho infra, chạy Studio local

Phương án này giữ hot reload cho Next.js và tránh xung đột cổng với Grafana.

```powershell
# 1. Clone repo
git clone [https://github.com/danhnguyenthanh260/novel-ai.git](https://github.com/danhnguyenthanh260/novel-ai.git)
cd novel-ai

# 2. Cài dependencies cho Studio
cd apps/studio
npm ci
Copy-Item .env.example .env.local
cd ../..

# 3. Tạo virtual environment cho worker (khuyên dùng)
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install psycopg2-binary

# 4. Bật các service phụ trợ
docker compose -f infra/docker-compose.yml up -d postgres neo4j qdrant historian-mcp-bridge

```

### Apply database migrations

Repo hiện tại không kèm migration runner tự động ở root. Fresh DBs apply the active baseline and any post-baseline migrations in `db/migrations/*.sql` by filename order. Historical migrations live under `db/migrations/archive/` for reference only.

```powershell
$env:DATABASE_URL = "postgresql://novel:novelpass@localhost:5433/novel"

Get-ChildItem db/migrations/*.sql |
  Sort-Object Name |
  ForEach-Object { psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f $_.FullName }

```

### Chạy ứng dụng và worker

```powershell
# Terminal 1: Studio local
cd apps/studio
npm run dev

# Terminal 2: Worker local (khuyên dùng nếu bạn dùng ingest / memory / analysis)
cd ..
cd ..
.\.venv\Scripts\Activate.ps1
$env:DB_DSN = "postgresql://novel:novelpass@localhost:5433/novel"
python services/memory-bridge/memory_bridge_worker.py

```

Sau khi chạy:

* Studio local: `http://localhost:3000`
* PostgreSQL: `localhost:5433`
* Neo4j Browser: `http://localhost:7474`
* Qdrant: `http://localhost:6333`
* Historian MCP bridge: `http://localhost:8090/healthz`

### Chạy full stack bằng Docker

Nếu bạn muốn chạy một bản production-like của Studio trong container:

```powershell
docker compose -f infra/docker-compose.yml up -d --build

```

Mặc định:

* Studio container: `http://localhost:3001`
* Grafana: `http://localhost:3000`

Lưu ý:

* Không nên chạy `npm run dev` cùng lúc với `grafana` nếu cả hai cùng dùng cổng `3000`
* `infra/docker-compose.yml` không tự động apply migration DB, vì vậy vẫn cần setup schema trước
* LLM server không nằm trong repo này; `novel-studio` container mong chờ một endpoint tại `host.docker.internal:8080`
* Nếu không muốn chạy local llama-server, có thể dùng Groq hoặc provider OpenAI-compatible khác bằng `LLM_API_BASE`, `LLM_API_KEY`, và `LLM_MODEL`; xem [LLM Provider Profiles](./docs/operations/llm-providers.md)

## Biến môi trường

Copy file mẫu:

```powershell
Copy-Item apps/studio/.env.example apps/studio/.env.local

```

Những biến quan trọng nhất:

| Biến | Bắt buộc | Mô tả |
| --- | --- | --- |
| `DATABASE_URL` | Có | Kết nối PostgreSQL cho Studio |
| `LLM_API_BASE` | Có | Base URL của OpenAI-compatible endpoint |
| `LLM_MODEL` | Có | Tên model mặc định |
| `LLM_API_KEY` | Có | API key hoặc token local |
| `LLM_MAX_TOKENS` | Tùy chọn | Conservative output cap for local/provider testing |
| `HISTORIAN_MCP_BASE_URL` | Nên có | Địa chỉ bridge cho external historian adapters |
| `HISTORIAN_QDRANT_ENABLED` | Tùy chọn | Bật semantic retrieval từ Qdrant |
| `HISTORIAN_NEO4J_ENABLED` | Tùy chọn | Bật graph retrieval từ Neo4j |
| `NEXT_PUBLIC_MUSE_CHAT_ENABLED` | Tùy chọn | Bật Muse chat trong UI |
| `LLAMA_MANUAL_ONLY` | Tùy chọn | Mặc định `1`, nghĩa là bạn tự start/stop LLM server |
| `INGEST_AUTO_START_WORKER` | Tùy chọn | Mặc định `1`, cho phép UI auto-start worker nếu đủ điều kiện |
| `MEMORY_WORKER_PYTHON` | Tùy chọn | Override đường dẫn Python cho worker auto-start |
| `MEMORY_WORKER_PID_FILE` | Tùy chọn | File PID cho worker do UI quản lý |

Lưu ý:

* `.env.example` trong `apps/studio/` là nguồn tham chiếu đầy đủ cho local setup
* Không commit API key thật. Với Groq/free-tier, bắt đầu bằng `LLM_MAX_TOKENS=512` và dùng `npm run doctor:llm -- --dry-run` trước khi gọi API thật
* Khi chạy `qdrant + neo4j + historian-mcp-bridge`, hãy bật `HISTORIAN_QDRANT_ENABLED=1` và `HISTORIAN_NEO4J_ENABLED=1`
* Nếu không có LLM server, các tính năng ingest/split/write/muse sẽ không hoạt động đầy đủ

## Cách sử dụng

Sau khi đang chạy local, flow cơ bản thường là:

1. Mở `http://localhost:3000` và vào `/shelf`
2. Tạo story mới hoặc mở story đã có
3. Vào `Ingest` để upload chapter, validate và review split
4. Vào `Write` để draft / stage / verify chapter
5. Vào `Reviews`, `Analysis`, `Memory`, `Map`, `Agents` khi cần kiểm tra pipeline hoặc tri thức của story

Một số route/workspace quan trọng đã tồn tại trong repo:

* `/shelf`
* `/stories/[slug]`
* `/stories/[slug]/settings`
* `/stories/[slug]/ingest`
* `/stories/[slug]/write`
* `/stories/[slug]/reviews`
* `/stories/[slug]/analysis`
* `/stories/[slug]/memory`
* `/stories/[slug]/map`
* `/stories/[slug]/agents`
* `/read/[storySlug]`

## Lệnh hữu ích

Tất cả lệnh Node bên dưới chạy trong `apps/studio/`.

```powershell
cd apps/studio

# Dev
npm run dev

# Quality gates
npm run lint
npm run typecheck
npm run build

# Doctor scripts
npm run doctor:pipeline
npm run doctor:memory-bridge
npm run doctor:ingest-validate
npm run doctor:review-flow
npm run doctor:canon-guard
npm run doctor:split-maturity -- --story <story_slug>

```

Kiểm tra nhanh worker Python:

```powershell
python -m py_compile services/memory-bridge/memory_bridge_worker.py services/memory-bridge/worker_text_repair.py services/memory-bridge/worker_split_quality.py services/memory-bridge/worker_profile_learning.py

```

## Tài liệu liên quan

* [apps/studio/README.md](https://www.google.com/search?q=./apps/studio/README.md): chi tiết UI/API, workflow scene và route quan trọng
* [docs/README.md](https://www.google.com/search?q=./docs/README.md): chỉ mục tài liệu hiện có
* [docs/operations/specs/system-business-handbook.md](https://www.google.com/search?q=./docs/operations/specs/system-business-handbook.md): tổng quan business-first cho người mới
* [infra/docker-compose.yml](https://www.google.com/search?q=./infra/docker-compose.yml): danh sách service local

## License

Dự án sử dụng giấy phép [MIT](https://www.google.com/search?q=./LICENSE.txt).
