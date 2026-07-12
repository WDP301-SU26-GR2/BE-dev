# Progress Log — Flow-Test Suite

> **Trạng thái cuối (2026-07-12, BE-A verify): 15/15 file PASS — 1.974 case, 0 FAIL.**
> Baseline BE kèm theo: `pnpm build` 0 · `pnpm test` **780/780** (108 suites) · `pnpm lint` **0 error**.

## Kết quả từng file (full run `pnpm flowtest`, exit 0)

| File | Case | Kết quả | Ghi chú |
|---|---:|---|---|
| flow-11-auth-identity | 58 | ✅ 0 FAIL | viết lại (23→58); lộ BE-012, BE-013 |
| flow-01-serialization | 82 | ✅ 0 FAIL | giữ nguyên; hết flake sau khi fix env/Redis |
| flow-06-contract-payment | 78 | ✅ 0 FAIL | 3 case expect-500 → expect-200 sau khi fix BE-004 |
| flow-02-chapter-production | 100 | ✅ 0 FAIL | giữ nguyên |
| flow-03-task-studio | 70 | ✅ 0 FAIL | viết lại (22→70) — trước đó thiếu ~60% ma trận §8 |
| flow-04-voting-ranking | 70 | ✅ 0 FAIL | giữ nguyên; hết flake |
| flow-05-lifecycle | 46 | ✅ 0 FAIL | viết lại (13→46) — trước đó chỉ là skeleton assert nới |
| flow-07-reprint | 55 | ✅ 0 FAIL | 1 FAIL cũ = BE-002 (đã fix BE) |
| flow-08-transfer | 74 | ✅ 0 FAIL | 1 FAIL cũ = BE-003 (đã fix BE) |
| flow-10-deadline | 29 | ✅ 0 FAIL | giữ nguyên |
| flow-12-13-franchise-publication | 19 | ✅ 0 FAIL | giữ nguyên |
| cross-rbac-sweep | 1350 | ✅ 0 FAIL | **450 FAIL → 0**: `route-roles.ts` nay sinh tự động từ metadata runtime |
| cross-ws | 6 | ✅ 0 FAIL | giữ nguyên |
| cross-cron | 22 | ✅ 0 FAIL | **từ "SKIPPED" → chạy thật** 7/7 cron |
| cross-events | 15 | ✅ 0 FAIL | viết lại (4→15) — trước chỉ smoke 200-OK, không verify event nào |

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

Chi tiết đầy đủ: [`FINDINGS.md`](./FINDINGS.md) — 14 finding, **0 OPEN**.
