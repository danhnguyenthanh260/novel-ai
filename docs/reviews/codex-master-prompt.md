# PROMPT TỔNG — Codex thực thi (Stage 4), self-directed

> Dán toàn bộ cho Codex. Codex CÓ quyền đọc/ghi repo `novel-ai` trực tiếp trong
> WSL — vậy nên prompt này TRỎ FILE để bạn tự đọc, không nhúng code sẵn. Bạn tự
> đọc những gì cần rồi tiến hành làm.

---

## VAI TRÒ & QUYỀN TRUY CẬP

Bạn là kỹ sư thực thi. Repo `novel-ai` nằm tại **`/home/danh/novel-ai`** (bạn đang chạy trong WSL, đọc/ghi trực tiếp được — cứ `cat`/`ls`/`sed`/edit như bình thường, KHÔNG cần UNC path).

Đây là chapter-first AI writing studio. App chính: `apps/studio` (Next.js 16, React 19, TS, Tailwind 4, **npm** — có `package-lock.json`). Worker: `services/memory-bridge` (Python 3.12).

## BƯỚC 0 — ĐỌC TRƯỚC KHI LÀM (bắt buộc, tự đọc)

1. `docs/reviews/investigation-report-v1.md` — báo cáo điều tra đầy đủ. **Đọc hết**, đặc biệt mục **P5 (risk register R1–R14)** và **P6 (master plan Sprint 0–5)**. Đây là ngữ cảnh vì sao có task này.
2. `apps/studio/package.json` — xác nhận scripts thật (đã biết: có `lint` = `eslint`, `typecheck` = `tsc --noEmit`, nhiều `doctor:*`, `test:e2e` = playwright; **KHÔNG có script `test` cho unit test**).
3. Các file `apps/studio/**/*.test.ts` hiện có + config eslint/tsconfig — để biết unit test đang chạy bằng gì (nếu có).
4. `.github/workflows/split-guardrail.yml` — CI DUY NHẤT hiện tại (chỉ chạy split-benchmark trên PR vào `main`).

## RÀNG BUỘC SCOPE (đọc kỹ — đừng làm quá)

- Chỉ làm **Sprint 1 (CI safety-net)** trong master plan — đây là phần **KHÔNG phụ thuộc quyết định sản phẩm**.
- **KHÔNG** đụng Sprint 2–5: không sửa logic generation, không wire/cắt Neo4j/Qdrant (R1 chưa được chốt build-hay-cắt), không gộp autowrite path, không đổi provider resolution, không thêm auth. Những cái đó chờ Report V2 sau khi GPT challenge.
- Nếu trong lúc làm bạn thấy một R nào đó dễ fix và an toàn, **ghi chú vào PR** thay vì tự ý làm.

## TRẠNG THÁI REPO (quan trọng — bảo toàn WIP)

- Branch hiện tại `feature/ui-kit-shadcn-foundation` có **working tree DIRTY** (WIP shadcn UI kit + chat-first shell + Gemini provider chưa commit).
- **TUYỆT ĐỐI KHÔNG:** `git stash`, `git checkout -- <file>`, `git reset`, commit đè, hay sửa bất kỳ file đang `M`. Mất WIP của user là hỏng.
- Tạo branch mới từ HEAD hiện tại: **`chore/ci-safety-net`**. Chỉ thêm file mới. Cuối cùng `git status` phải cho thấy các file `M` ban đầu vẫn nguyên.

## TASK (Sprint 1)

**A. Dựng unit-test runner.** Hiện chưa có script `test` / runner cho các file `*.test.ts`. Thêm **vitest** (hợp Next/TS, nhanh) vào `apps/studio`: cài devDependency, thêm `vitest.config.ts` tối thiểu, thêm script `"test": "vitest run"` và `"test:watch": "vitest"`. Đảm bảo các `*.test.ts` hiện có chạy được (sửa import/path nếu cần, KHÔNG sửa logic sản phẩm).

**B. Thêm test cho logic chưa phủ (ưu tiên file logic nặng, đang bị sửa ở WIP nên dễ regress):**
- `apps/studio/src/features/llm/llmProviderProfiles.ts` → `validateLlmProviderConfig`: baseUrl thiếu / sai scheme / hợp lệ; model rỗng; maxTokens ≤ 0.
- `apps/studio/src/features/llm/server/llmProviderRuntime.ts` → `writeRuntimeProviderConfig`: đổi provider ⇒ key cũ bị bỏ (fallback default); same-provider + key rỗng ⇒ giữ key cũ. (Mock filesystem/`NOVEL_RUNTIME_DIR` để không ghi thật.)

**C. CI gate.** Thêm `.github/workflows/ci.yml` chạy trên `pull_request` + `push`, job `studio-checks`:
`cd apps/studio` → `npm ci` → `npm run lint` → `npm run typecheck` → `npm test`.
- KHÔNG chạy Playwright e2e ở đây (cần LLM/DB thật). Nếu muốn, để job riêng gated bằng label, `continue-on-error`.
- KHÔNG phụ thuộc secret (không đụng `SPLIT_BENCHMARK_DB_DSN`).
- Giữ `split-guardrail.yml` nguyên, đừng xóa.

## RIGOR & VERIFY (Standard — verify thật, dán output)

Chạy thật trong WSL và dán output vào PR:
```bash
cd /home/danh/novel-ai/apps/studio
npm ci
npm run lint
npm run typecheck
npm test
cd /home/danh/novel-ai && git status --short   # chứng minh WIP các file M còn nguyên
```
Nếu `lint`/`typecheck` báo lỗi có sẵn từ WIP (không phải do bạn), ghi rõ trong PR là pre-existing, đừng "sửa" WIP để né.

## ACCEPTANCE CRITERIA

1. `npm test` chạy được, các `*.test.ts` cũ + test mới đều pass; số test tăng.
2. `.github/workflows/ci.yml` hợp lệ; các lệnh trong đó pass khi chạy local.
3. `apps/studio/package.json` có script `test`; vitest là devDependency; `package-lock.json` cập nhật.
4. Các file `M` (WIP) trong `git status` KHÔNG thay đổi so với trước khi bạn bắt đầu.
5. PR body: liệt kê file thêm, output thật của lint/typecheck/test (pass/fail), ghi rõ e2e chưa vào gate + lý do, và mọi R phát hiện thêm nhưng KHÔNG tự sửa.

## KHI XONG
Mở PR nhánh `chore/ci-safety-net` → `feature/ui-kit-shadcn-foundation` (hoặc `main` nếu user muốn — hỏi nếu không chắc base). Không tự merge.
