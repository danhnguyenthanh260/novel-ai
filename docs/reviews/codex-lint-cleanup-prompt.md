# PROMPT — Codex: dọn 52 lỗi lint để CI (PR #201) xanh thật

> Dán cho Codex (chạy trong WSL, đọc/ghi `/home/danh/novel-ai` trực tiếp).
> Mục tiêu: `npm run lint` trong `apps/studio` về **0 error**, để job CI ở PR #201
> pass và PR bỏ trạng thái draft. KHÔNG hạ chuẩn (không tắt rule, không `|| true`).

---

## NGỮ CẢNH

Tiếp nối Sprint 1: PR #201 (`chore/ci-safety-net` → `feature/ui-kit-shadcn-foundation`, commit `92b29c4`) đã thêm CI chạy `npm ci → lint → typecheck → test`. CI đỏ ở bước **lint** vì có **52 error / 212 warning nợ baseline** trong code cũ. Nhiệm vụ này: fix hết 52 **error** (warning để sau, đừng đụng nếu không cần).

Đọc trước: `docs/reviews/investigation-report-v1.md` (P5 R11 nói về file god-size — liên quan tới nhóm `max-lines`).

## LÀM Ở ĐÂU
- **Cùng branch `chore/ci-safety-net`** (để fix vào thẳng PR #201). Commit mới, message rõ ràng (vd `fix(lint): clear 52 baseline eslint errors`).
- Có thể tách 2–3 commit theo nhóm để dễ review.

## RÀNG BUỘC TUYỆT ĐỐI — KHÔNG ĐỤNG WIP
12 file sau đang có WIP chưa commit của user. Chúng **KHÔNG** nằm trong 52 lỗi, nên bạn **không có lý do gì để chạm vào**. Nếu buộc phải, DỪNG và báo:
```
apps/studio/.env.example, apps/studio/README.md, apps/studio/scripts/doctor_llm.mjs,
apps/studio/src/app/globals.css,
apps/studio/src/features/llm/components/LlmProviderSelector.tsx,
apps/studio/src/features/llm/llmProviderProfiles.ts,
apps/studio/src/features/llm/server/llmProviderRuntime.ts,
apps/studio/src/features/scenes/components/writeTab/NovelLabWorkspace.tsx,
apps/studio/src/features/scenes/components/writeTab/chatOrchestration/ChatTimeline.tsx,
docs/architecture/novel-lab-design.md, docs/operations/llm-providers.md,
docs/operations/specs/chat-first-ui-shell-and-shadcn-adoption.md
```
Không `git stash`, không `checkout --`, không `reset`. Cuối cùng `git status` phải cho thấy 12 file M này nguyên hash.

## 52 LỖI THEO NHÓM + CÁCH XỬ LÝ (phân tầng — đừng fix ẩu)

Lấy danh sách chính xác: `cd apps/studio && npm run lint`. Phân bố:

**Tầng 1 — sửa đúng, an toàn (ưu tiên trước):**
- **`react/no-unescaped-entities` (7 lỗi):** escape `'`/`"`/`>` trong JSX text (`&apos;` `&quot;` hoặc bọc trong `{"..."}`). Thuần cơ học.
- **`no-restricted-imports` (1 lỗi):** sửa theo đúng ranh giới import mà rule yêu cầu (đọc message rule để biết import hợp lệ là gì). Không nới rule.

**Tầng 2 — `@typescript-eslint/no-explicit-any` (37 lỗi) — CẦN TYPE ĐÚNG:**
- Thay `any` bằng **type chính xác** suy từ ngữ cảnh (đọc shape dữ liệu thật: API response, DB row, props). Ưu tiên interface/type đã có trong repo.
- Nếu thực sự không xác định được kiểu, dùng `unknown` + narrow, KHÔNG dùng `any` trá hình.
- Chỉ khi bất khả kháng mới `// eslint-disable-next-line @typescript-eslint/no-explicit-any` **kèm comment lý do cụ thể** — và liệt kê mọi chỗ disable trong PR để user review. Đừng lạm dụng disable để "cho xanh".

**Tầng 3 — CẦN PHÁN ĐOÁN, rủi ro cao (làm cẩn thận, tách commit riêng):**
- **`max-lines` (5 lỗi):** file vượt hạn dòng. Tách thành module con **giữ nguyên hành vi** (pure move, không đổi logic). Nếu việc tách một file nào đó rủi ro/lan rộng, DỪNG file đó lại, ghi vào PR, và (chỉ file đó) dùng inline disable kèm lý do — thay vì tách vội gây bug.
- **`setState synchronously within an effect` (2 lỗi):** đây có thể là **bug render thật** (cascading render). Xem kỹ effect: thường fix bằng cách bỏ setState khỏi effect, tính giá trị trong render, hoặc gộp state. **Không** che bằng disable. Nếu không chắc fix đúng hành vi, DỪNG và mô tả trong PR để user/Claude quyết.

## VERIFY (Standard rigor — chạy thật, dán output vào PR)
```bash
cd /home/danh/novel-ai/apps/studio
npm run lint        # PHẢI: 0 error (warning còn cũng được, miễn 0 error)
npm run typecheck   # phải sạch
npm test            # 24 test vẫn pass
npm run build       # production build vẫn pass (đảm bảo type-fix không vỡ build)
cd /home/danh/novel-ai && git status --short   # 12 file WIP M nguyên hash
```

## ACCEPTANCE
1. `npm run lint` = **0 error**.
2. `typecheck`, `npm test` (24), `npm run build` đều pass — dán output thật.
3. Không đụng 12 file WIP; `git status` chứng minh.
4. PR #201 cập nhật: bỏ draft **chỉ khi** CI xanh thật; body liệt kê: nhóm lỗi đã fix, mọi chỗ `eslint-disable` đã thêm (kèm lý do), mọi file tầng-3 bị DỪNG (nếu có) + lý do.
5. Nếu 2 lỗi `setState-in-effect` hóa ra là bug hành vi cần quyết định → để lại, ghi rõ, đừng ép xanh bằng disable.

## LƯU Ý
Không tự merge. Không đụng Sprint 2–5. Nếu phát hiện thêm vấn đề ngoài phạm vi → ghi chú, đừng tự sửa.
