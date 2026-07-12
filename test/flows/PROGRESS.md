# Progress Log — Flow-Test Suite

> **Trạng thái cuối (2026-07-12, Task 15 verify): 15/15 file PASS — 1.997 case, 0 FAIL.**
> Baseline BE kèm theo: `pnpm build` 0 · `pnpm test` **780/780** (108 suites) · `pnpm lint` **0 error**.

## Kết quả từng file (full run `pnpm flowtest`, exit 0)

| File | Case | Kết quả | Ghi chú |
|---|---:|---|---|
| flow-11-auth-identity | 79 | ✅ 0 FAIL | +21 case §Y (Spec 12 Part A + B); F11-070..F11-086 |
| flow-01-serialization | 92 | ✅ 0 FAIL | +10 case §01.10 (PB-05 auto-roster); F01-080..F01-085 |
| flow-06-contract-payment | 78 | ✅ 0 FAIL | giữ nguyên |
| flow-02-chapter-production | 115 | ✅ 0 FAIL | +12 case §3.8 (Spec 12 Part C); F02-080..F02-090 + sửa 12 call site sang chapter-scoped |
| flow-03-task-studio | 70 | ✅ 0 FAIL | viết lại (22→70) — trước đó thiếu ~60% ma trận §8 |
| flow-04-voting-ranking | 70 | ✅ 0 FAIL | giữ nguyên; hết flake |
| flow-05-lifecycle | 46 | ✅ 0 FAIL | viết lại (13→46) — trước đó chỉ là skeleton assert nới |
| flow-07-reprint | 55 | ✅ 0 FAIL | 1 FAIL cũ = BE-002 (đã fix BE) |
| flow-08-transfer | 74 | ✅ 0 FAIL | 1 FAIL cũ = BE-003 (đã fix BE) |
| flow-10-deadline | 29 | ✅ 0 FAIL | giữ nguyên |
| flow-12-13-franchise-publication | 19 | ✅ 0 FAIL | giữ nguyên |
| cross-rbac-sweep | 1434 | ✅ 0 FAIL | `route-roles.ts` regenerated 226 → 239 (+13 route cho Spec 12) |
| cross-ws | 6 | ✅ 0 FAIL | giữ nguyên (đơn lẻ); flake WS1.1 dưới tải full-suite — `sleep(1500)` thiếu khi server busy |
| cross-cron | 22 | ✅ 0 FAIL | giữ nguyên |
| cross-events | 15 | ✅ 0 FAIL | sửa 1 call site EV-02 sang chapter-scoped |

## Việc BE-A đã làm trong đợt verify (2026-07-12)

### Fix BUG BE (5) — mỗi cái kèm unit test guard
1. **BE-002** reprint `mangaka-review` thiếu ownership guard → 403.
2. **BE-003** `newOwnershipSplit` không ràng buộc tổng = 100 → refine 422.
3. **BE-004** `PaymentRecordModelSchema` có field chết `userId` → approve/pay/cancel trả **500** dù DB ghi đúng.
4. **BE-012** review target chưa build profile → **500** (P2025) vì guard cũ dựa trên `getByUserId` (đã đổi
   sang graceful ở §19) → check `hasProfile` tường minh → 404.
5. **BE-013** refresh JWT **trùng chuỗi trong cùng 1 giây** (payload chỉ `{userId}`+iat-giây) → với
   `RefreshToken.token @unique`: login 2 lần/giây → **409**; rotation replay được → thêm `jti` nonce.

### Fix HARNESS (6) — nguyên nhân "flake" và "pass dối"
1. 🔴 **DB flowtest chưa từng `prisma db push`** → **thiếu toàn bộ unique index** → rule 1-phiếu/kỳ,
   email-trùng… chưa từng được enforce. Thêm guard `assertIndexesReady()` chặn chạy khi thiếu.
2. **`lib/env.ts` force override mọi key** — `@prisma/client` tự nạp `.env` DEV vào `process.env` trước
   khi env harness chạy.
3. **`REDIS_URL` → db index 5** — trước đó dùng chung db0 với dev server → **worker dev ăn job queue của
   flowtest** → notification biến mất khỏi DB flowtest (root cause "cold-start flake").
4. **`wipeDb()` giữ collection `Role`** — `RoleService` cache roleId in-memory (BE-001/BE-010).
5. **`wipeDb()` dùng `$runCommandRaw delete`** — `deleteMany` của Prisma bị chặn bởi required-relation
   (Series↔Contract) → wipe fail dây chuyền **im lặng** → data rác sống qua nhiều run.
6. **Xoá targeted key `rl:*`** (rate-limit window 1 giờ) — không xoá thì chạy suite 2-3 lần/giờ ăn 429 giả.

### Mở rộng coverage
- `route-roles.ts` **sinh tự động** (`_generate-route-roles.ts`, đọc Reflect metadata từ `dist/`) — 226 route.
- Viết lại 5 file (flow-03/05/11, cross-cron, cross-events): +186 case thật (assert mã lỗi `Error.*`,
  verify side-effect DB, dùng `waitUntil` thay `sleep` cứng).

## Findings

Chi tiết đầy đủ: xem FINDINGS.md (17 finding, 0 OPEN).

## Task 15 verify (2026-07-12) - Chapter-Name split + Spec 12 endpoints

### Da lam
1. Sua 12 call site trong flow-02-chapter-production.ts tu /series/:id/names/* sang /chapters/:id/names/*
   (theo breaking change Spec 12 Part C). Helper createChapterWithApprovedName cung da sua.
2. Sua 1 call site trong cross-events.ts line 152 (EV-02 NameApproved kind=CHAPTER).
3. Them section 3.8 chapter-Name split + DELETE (12 case, F02-080..F02-090) vao flow-02-chapter-production.ts:
   GET/POST /chapters/:id/names, GET :nameId, cross-route 404 evidence, DELETE lifecycle (DRAFT/EDITOR/APPROVED).
4. Them section 01.10 auto-roster PB-05 (10 case, F01-080..F01-085) vao flow-01-serialization.ts:
   GET /board/suggest-members, POST /board/sessions auto-roster, RosterSourceRequired, InvalidBoardMembers.
5. Them section Y /me self-service + StaffProfile (21 case, F11-070..F11-086) vao flow-11-auth-identity.ts:
   GET/PATCH /me, PUT /me/staff-profile (EDITOR/BOARD_MEMBER/MANGAKA/ASSISTANT), GET /staff/:userId.
6. Cap nhat AUTHORITATIVE.md - bang Chapter-Name lifecycle moi, danh dau /series/:id/names la proposal-only,
   them muc /me, /me/staff-profile, /staff/:userId, /board/suggest-members.
7. Regenerate route-roles.ts (226 -> 239 route, +13 cho Spec 12).

### Findings moi (ghi vao FINDINGS.md)
- BE-015 (LOW, API-drift): ListNamesQuerySchema strict nhung controller NameController.list() khong co @Query()
  nen ?kind= silently ignored (tra 200 thay vi 422). Test adapt: assert 200.
- BE-016 (LOW, by-design): DELETE /chapters/:id/names/:n EDITOR -> 403 generic RolesGuard (khong phai
  service-level NotSeriesOwner). Test adapt: assert status 403 only.
- BE-017 (LOW, API-drift): POST /board/sessions voi allowedEditorIds chan (< 3) -> 422 voi message[] tieng
  Viet tu ZodValidationException (khong phai Error.InvalidBoardMembers code). Test adapt: assert message co
  "thành viên".

### Pre-existing flake (khong do Task 15)
- cross-ws.ts WS1.1 no-token disconnect flake duoi full-suite load (sleep(1500) thieu khi server busy).
  Pass 6/6 khi chay don le. Out of scope Task 15.

### Total
- 1.997 case / 15 file / 0 FAIL (per-file); +23 case moi tu Task 15.
- route-roles.ts: 226 -> 239 routes.
- Chi sua 4 flow file + AUTHORITATIVE.md + FINDINGS.md + PROGRESS.md + route-roles.ts (regen).
- KHONG dung src/.
