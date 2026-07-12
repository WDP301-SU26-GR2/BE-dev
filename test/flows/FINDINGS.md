# FINDINGS — Bug Backend phát hiện qua Flow-Test Suite

> **Bug ledger** của flow-test. Khi test phát hiện bug thật của BE (status sai, payload sai, 500,
> state machine vi phạm, race, thiếu guard...), ghi vào đây.
>
> **Cập nhật 2026-07-12 (BE-A review + verify):** đã **triage lại toàn bộ** 11 finding cũ do AI ghi.
> Kết quả: **3 là bug BE thật (đã FIX)**, **2 là bug HARNESS** (test tự sai), **6 là API-drift/nhầm lẫn**
> (route/DTO của test lệch code thật — sửa test). BE-A tìm thêm **3 bug mới** khi mở rộng coverage
> (BE-012, BE-013 + gap index DB BE-014).
>
> **Trạng thái:** 0 FAIL trên toàn suite; mọi bug BE đã fix + có unit test guard.

---

## 📊 BẢNG TỔNG HỢP

| ID | Mức | Nội dung | Loại | Trạng thái |
|---|---|---|---|---|
| BE-001 | ~~CRITICAL~~ | register → login 500 (roleId null) | **HARNESS** | ✅ CLOSED (không phải bug BE) |
| BE-002 | HIGH | Reprint `mangaka-review` không check ownership | **BUG BE** | ✅ FIXED |
| BE-003 | MEDIUM | `createTransferContract` không validate split = 100 | **BUG BE** | ✅ FIXED |
| BE-004 | HIGH | `PATCH /payments/:id/{approve,pay,cancel}` → 500 | **BUG BE** | ✅ FIXED |
| BE-005 | MEDIUM | "Chapter-Name không add page khi DRAFT" | API-drift | ✅ CLOSED (test sai route) |
| BE-006 | MEDIUM | "route co-owner-approve không tồn tại" | API-drift | ✅ CLOSED (route CÓ tồn tại) |
| BE-007 | LOW | Contract TERMINATED → `ContractNotExecuted` | by-design | ✅ CLOSED |
| BE-008 | INFO | API drift catalog | doc | ✅ CLOSED (bảng route nay sinh tự động) |
| BE-009 | LOW | cross-cron skip (NestContext "conflict") | **HARNESS** | ✅ CLOSED (cron nay chạy thật 22/22) |
| BE-010 | HIGH | RoleService cache stale sau wipeDb | **HARNESS** | ✅ CLOSED (wipe giữ Role) |
| BE-011 | HIGH | Refresh rotation "không hoạt động" | mis-assert | ✅ CLOSED → hé lộ **BE-013** |
| **BE-012** | **HIGH** | Review target chưa có profile → **500** | **BUG BE** | ✅ FIXED |
| **BE-013** | **HIGH** | Refresh JWT trùng chuỗi trong 1 giây → **409** + replay | **BUG BE** | ✅ FIXED |
| **BE-014** | **CRITICAL** | DB flowtest **thiếu toàn bộ unique index** | **HARNESS** | ✅ FIXED |
| **BE-015** | LOW | `ListNamesQuerySchema` strict nhưng controller không `@Query()` → `?kind=` bị ignore | API-drift | ✅ CLOSED (test adapt: accept 200, kind ignored) |
| **BE-016** | LOW | `DELETE /chapters/:id/names/:n` EDITOR → 403 với message generic "You do not have permission..." (RolesGuard) thay vì `Error.NotSeriesOwner` service-level. Cả 2 đều đúng về mặt security; chỉ khác error code. | by-design | ✅ CLOSED (test adapt: assert status 403, không strict error code) |

---

## 🔴 BUG BE THẬT — ĐÃ FIX

### FINDING-BE-002: Mangaka bất kỳ review được ReprintRequest của series người khác
- **Phát hiện:** `flow-07-reprint.ts` case 7.8a · **Severity:** HIGH (vi phạm Ownership Principle / BR-CONTRACT-03)
- **Actual:** `PATCH /reprint-requests/:id/mangaka-review` trả 200 + `MANGAKA_APPROVED` cho **bất kỳ** MANGAKA.
- **Root cause:** `ReprintRequestService.mangakaReview()` chỉ check `contract.contractType === 'REVENUE_SHARE'`,
  **không** so `contract.mangakaId` với `actorId`.
- **Fix:** guard ownership ngay sau khi load contract → 403 `Error.ReprintActionNotAllowed`.
  File: `src/modules/reprint/services/reprint-request.service.ts`.
- **Test guard:** `reprint-request.service.spec.ts` — *"mangakaReview by non-owner mangaka → 403"*.
- **Status:** ✅ FIXED

### FINDING-BE-003: `createTransferContract` nhận ownership split tổng ≠ 100
- **Phát hiện:** `flow-08-transfer.ts` case 8.21 · **Severity:** MEDIUM (PB-09)
- **Actual:** `POST /transfers/contracts` với `newOwnershipSplit: { A: 60, B: 30 }` (tổng 90) → 201.
- **Root cause:** schema khai `z.record(z.string(), z.any())` — không ràng buộc tổng.
- **Fix:** `newOwnershipSplit` → `z.record(z.string(), z.number().min(0).max(100))` + `.refine(tổng === 100)`
  → 422 `Error.InvalidOwnershipSplit`. File: `src/modules/transfer/schemas/transfer-schema.ts`.
- **Test guard:** `transfer.service.spec.ts` — 3 test (tổng 100 OK / tổng 90 fail / giá trị âm fail).
- **Status:** ✅ FIXED

### FINDING-BE-004: `PATCH /payments/:id/{approve,pay,cancel}` → 500 (DB đã ghi, response vỡ)
- **Phát hiện:** `flow-06-contract-payment.ts` 06.3c/f/j · **Severity:** HIGH
- **Actual:** DB transition ĐÚNG (TRIGGERED→APPROVED→PAID) nhưng HTTP trả **500**:
  `ZodSerializationException: path ["userId"] expected string, received undefined`.
- **Root cause:** `PaymentRecordModelSchema` khai field **`userId`** — entity `PaymentRecord` **không có**
  field này (chỉ `receiverId`/`createdBy`/`approvedBy`) → Zod serialize response fail → 500.
  (Đúng kiểu gotcha §10: build/test tĩnh không bắt được, chỉ lộ khi gọi API thật.)
- **Fix:** xoá field chết `userId` khỏi schema. File: `src/modules/payment/schemas/payment.model.ts`.
- **Test guard:** `payment.service.spec.ts` — *"PaymentRecordModelSchema khớp shape Prisma"*.
- **Status:** ✅ FIXED

### FINDING-BE-012: Review target chưa build profile → **500** (P2025)
- **Phát hiện:** `flow-11-auth-identity.ts` F11-039b · **Severity:** HIGH
- **Steps:** Mangaka thuê Assistant → assignment TERMINATED → `POST /assistant-reviews` khi Assistant
  **chưa từng** `PUT /me/assistant-profile` → **500**.
- **Root cause (drift 2 bước):** `AssistantReviewService` có dòng
  `// Validate target has an assistant profile (throws ProfileNotFoundException if missing)` — nhưng
  `AssistantProfileService.getByUserId` **đã đổi thành GRACEFUL** ở §19 (chưa có profile → trả default +
  `hasProfile:false`, **KHÔNG throw**). Guard chết âm thầm → chạy tiếp tới `applyReputation` →
  `assistantProfile.update({where:{userId}})` → **P2025** → 500. Y hệt với `MangakaReviewService`.
- **Fix:** check cờ tường minh `if (!targetProfile.hasProfile) throw ProfileNotFoundException` ở **cả 2**
  service + `@ApiErrors` cho 2 route.
  Files: `reviews/services/{assistant,mangaka}-review.service.ts`, `reviews/reviews.controller.ts`.
- **Test guard:** 2 spec — *"target chưa build profile → 404, KHÔNG 500"* (assert repo/applyReputation không bị gọi).
- **Status:** ✅ FIXED

### FINDING-BE-013: Refresh JWT **trùng chuỗi** trong cùng 1 giây → 409 + rotation replay
- **Phát hiện:** `flow-11-auth-identity.ts` F11-005 (chỉ lộ SAU khi DB có unique index — xem BE-014)
- **Severity:** HIGH (bảo mật + robustness)
- **Root cause:** `signRefreshToken({ userId })` — payload chỉ `{userId}` + `iat`/`exp` (**giây**) ⇒ 2 lần ký
  trong **cùng 1 giây** cho ra JWT **byte-identical**. Kết hợp `RefreshToken.token @unique`:
  1. **login/refresh 2 lần liền nhau → P2002 → 409 "Record already exists"** (user không đăng nhập được khi
     double-click / 2 tab / retry / load-test).
  2. **Rotation vô hiệu trong cửa sổ 1 giây:** token "mới" === token "cũ" → delete-old-row rồi insert lại
     chính chuỗi đó → refresh cũ **vẫn dùng được** (replay).
- **Fix:** thêm nonce `jti: randomUUID()` vào payload refresh token.
  Files: `infrastructure/token/token.service.ts` + `jwt.type.ts`.
- **Test guard:** `token.service.spec.ts` (MỚI) — 2 test: ký song song → chuỗi khác nhau; payload có `jti`.
- **Status:** ✅ FIXED

---

## 🟡 BUG HARNESS (test tự sai — KHÔNG phải bug BE)

### FINDING-BE-014 🔴: DB `Mangaka-flowtest` CHƯA từng `prisma db push` → **thiếu TOÀN BỘ unique index**
- **Nghiêm trọng nhất về độ tin cậy của bộ test.** Mongo tự tạo collection khi ghi doc đầu tiên,
  **không kèm index**. DB flowtest chỉ có `_id_`.
- **Hệ quả:** mọi rule dựa trên unique/P2002 **chưa từng được enforce** → test "pass" một cách **dối**:
  - `User.email` unique → register trùng email lẽ ra 409, thực tế **201**.
  - `OtpRequest[email,purpose]`, `ReaderVote[surveyPeriodId,identityHash]` (**rule 1-phiếu/kỳ**!), `RefreshToken.token`.
- **Fix:** (1) `DATABASE_URL=<flowtest> npx prisma db push`; (2) thêm guard **`assertIndexesReady()`** trong
  `lib/seed.wipeDb()` — thiếu index → **exit 2 + hướng dẫn**, không cho chạy tiếp (chống tái diễn).
- **Ghi chú:** chính index này làm lộ **BE-013**.

### FINDING-BE-001 / BE-010: register → login 500 (roleId stale)
- **KHÔNG phải bug BE.** Harness `wipeDb()` xoá cả collection `Role`, trong khi `RoleService` (server đang
  chạy) **cache `roleId` in-memory** (Map, không invalidate) → user mới nhận `roleId` của role đã bị xoá →
  `include: { role: true }` trả null → Prisma throw → 500.
- **Fix harness:** `wipeDb()` **GIỮ collection Role** (dữ liệu seed bất biến trong production);
  `seedRolesAndAdmin()` idempotent (chỉ tạo role còn thiếu).

### FINDING-BE-009: cross-cron bị skip ("NestContext conflict với server :4100")
- **Không có conflict thật.** Nguyên nhân là `lib/env.ts` không force-override `DATABASE_URL`/`REDIS_URL`
  → context boot lên nối nhầm DB/Redis.
- **Fix:** cron nay chạy THẬT qua `withCronContext` — **22/22 PASS** (6 cron gọi trực tiếp + board-scheduler
  đợi tick thật).

### Env pollution (hạ tầng harness — root cause của loạt "flake")
- `@prisma/client` **tự load `.env`** (env DEV) vào `process.env` ngay khi import ⇒ ESM hoisting khiến entry
  file bị nhiễm `DATABASE_URL`/`REDIS_URL` **dev** TRƯỚC khi `lib/env.ts` chạy.
- **Hệ quả thật đã dính:** cron-context enqueue notification vào **queue của dev server** → dev server (nối
  Mongo DEV) tranh job → notification "biến mất" khỏi DB flowtest **ngẫu nhiên** — chính là loạt
  "cold-start flake" mà PROGRESS cũ ghi nhận.
- **Fix:** `lib/env.ts` **FORCE override mọi key** từ `.env.flowtest`; `REDIS_URL` dùng **db index 5** riêng
  (cô lập BullMQ + cron lock khỏi dev server chạy cùng máy).
- **Fix kèm:** `wipeDb()` xoá **targeted** key `rl:*` (rate-limit OTP, window 1 giờ) — nếu không, chạy suite
  2-3 lần trong cùng giờ sẽ ăn 429 hàng loạt (đỏ giả).

---

## ⚪ API-DRIFT (test sai — đã sửa test, KHÔNG đụng BE)

- **BE-005** "chapter-Name không add page khi DRAFT": route đúng là **series-scoped**
  `PUT|POST /series/:id/names/:nameId/pages` (KHÔNG có route lifecycle dưới `/chapters`) — xem A-CHP-01 AC2.
- **BE-006** "route `/chapters/:id/co-owner-approve` không tồn tại": route **CÓ** (`chapter.controller.ts:278`).
- **BE-007** Contract TERMINATED → publish ném `ContractNotExecuted`: **đúng thiết kế** (BR-CONTRACT-05);
  ending-chapter có nhánh bypass riêng (Fix-1 §1.5).
- **BE-008** API drift catalog: nay `route-roles.ts` **sinh tự động** từ Reflect metadata runtime
  (`_generate-route-roles.ts`) → hết drift thủ công.
- **BE-011** "rotation không hoạt động": assert bị nới (chấp nhận cả 201). Siết lại → lộ **BE-013** thật.
- **BE-015** `GET /series/:id/names?kind=CHAPTER` không trả 422 — strict schema `ListNamesQuerySchema` khai `z.object({}).strict()` nhưng controller `NameController.list()` **không có `@Query()` decorator** nên `kind` bị silently ignored (trả 200 + proposal-Name). Spec 12 §C đã chuyển sang 1-kind-only; behavior hiện tại đúng về mặt trả dữ liệu (chỉ proposal), nhưng KHÔNG có guard chống client gửi field lạ.
- **BE-016** `DELETE /chapters/:id/names/:n` với EDITOR → 403 nhưng message là generic RolesGuard
  `"You do not have permission to access this resource"` thay vì `Error.NotSeriesFound`-like service-level.
  EDITOR không thuộc `@Roles(MANGAKA)` → bị RolesGuard chặn sớm, không tới service. Cả 2 đều đúng security-wise.

---

## Quy tắc ghi finding mới

```
### FINDING-BE-XXX: <tiêu đề>
- **Phát hiện bởi:** <file test> + case ID
- **Severity:** CRITICAL | HIGH | MEDIUM | LOW
- **Steps / Actual / Expected:** ...
- **Root cause:** (file + hàm)
- **Fix:** (file + mô tả) · **Test guard:** (spec nào)
- **Status:** OPEN | FIXED | WONT_FIX
```
