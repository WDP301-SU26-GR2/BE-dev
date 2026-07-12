# Flow-Test Suite (Acceptance Test) — Flow 1–13

> Bộ acceptance test **end-to-end trên hệ thật**: server NestJS (port 4100) + MongoDB replica-set `rs0`
> + Redis + BullMQ + WebSocket + cron. Không mock gì cả.
>
> **Trạng thái (2026-07-12):** **15/15 file PASS — 1.974 case, 0 FAIL.**

## Vì sao cần (bổ sung cho 780 unit test)

Unit test mock repo → **không bắt được lỗi tích hợp**. Loạt bug chỉ lộ ở đây:
`deletedAt isSet:false`, mock-blindspot reprint, schema-mismatch → 500, JWT trùng chuỗi, thiếu index DB…
Xem [`FINDINGS.md`](./FINDINGS.md).

---

## Chạy từ số 0

### 1. Hạ tầng
```bash
# MongoDB replica set (bắt buộc — Prisma cần transaction)
mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'   # chỉ 1 lần
mongosh --eval 'rs.status().members[0].stateStr'   # phải in PRIMARY

# Redis
docker start redis   # hoặc container Redis bất kỳ map cổng 6379
```

### 2. `.env.flowtest`
```bash
cp .env.flowtest.example .env.flowtest
```
Ba dòng **bắt buộc đúng**:
```
DATABASE_URL="mongodb://localhost:27017/Mangaka-flowtest?replicaSet=rs0"
PORT=4100
REDIS_URL=redis://localhost:6379/5      # ⚠ db index 5 — CÔ LẬP khỏi dev server (xem §Gotcha)
AI_SERVICE_URL=                          # rỗng = AI tắt (test assert nhánh 503 fallback)
```

### 3. 🔴 Tạo index cho DB flowtest (BẮT BUỘC — làm 1 lần)
```bash
DATABASE_URL="mongodb://localhost:27017/Mangaka-flowtest?replicaSet=rs0" npx prisma db push --skip-generate
```
> Mongo tự tạo collection khi ghi doc đầu, **không kèm index**. Bỏ qua bước này → mọi unique constraint
> (`User.email`, `ReaderVote[period,identityHash]` = rule 1-phiếu/kỳ, `RefreshToken.token`…) **KHÔNG được
> enforce** → test "pass" một cách **dối** (xem FINDING-BE-014).
> Harness có guard `assertIndexesReady()` — thiếu index sẽ **exit 2** kèm hướng dẫn.
> Nếu `db push` báo E11000 (data cũ trùng): drop collection rồi push lại.

### 4. Build + chạy server test (terminal riêng)
```bash
pnpm build
node --env-file=.env.flowtest dist/main.js
```

### 5. Chạy test
```bash
pnpm flowtest                                    # cả 15 file, tuần tự
pnpm flowtest --only=flow-04                     # 1 file (match substring)
pnpm flowtest:one test/flows/flow-05-lifecycle.ts # chạy trực tiếp 1 file
```
Exit code: `0` = all pass · `1` = có FAIL · `2` = lỗi tiền đề (server chưa chạy / DB sai / thiếu index).

---

## Cấu trúc

```
test/flows/
├── lib/
│   ├── env.ts     # load .env.flowtest (FORCE override mọi key) + GUARD: DATABASE_URL phải chứa 'flowtest'
│   ├── http.ts    # req/ok/expectError/expectStatus/section/summary — đọc envelope {success,message,data}
│   ├── seed.ts    # prisma client + wipeDb + assertIndexesReady + ~15 fast-forward factory
│   ├── auth.ts    # login (cache theo email) + seedOtp (bcrypt '123456')
│   ├── ws.ts      # socket.io client cho namespace /board
│   └── cron.ts    # withCronContext (boot AppModule, stop cron tick, gọi .run() thủ công) + clearCronLocks + waitUntil
├── flow-01..13    # 11 file theo Flow của Requiment
├── cross-rbac-sweep.ts   # 226 route × 6 token = 1.350 probe
├── cross-ws.ts           # WebSocket board (auth handshake + room + broadcast)
├── cross-cron.ts         # 7 cron chạy THẬT (6 gọi trực tiếp + board-scheduler đợi tick)
├── cross-events.ts       # 10 cặp event emit→listen, verify side-effect DB
├── route-roles.ts        # ⚠ SINH TỰ ĐỘNG — RBAC contract
├── _generate-route-roles.ts   # generator: đọc Reflect metadata runtime từ dist/
└── run-all.ts            # runner
```

### Coverage hiện tại

| File | Case | Nội dung |
|---|---:|---|
| flow-11-auth-identity | 58 | register/verify/login/refresh-rotation/forgot/admin-moderation/reputation Bayesian |
| flow-01-serialization | 82 | proposal → claim/release race → review loop → pitch → board vote → SERIALIZED |
| flow-06-contract-payment | 78 | contract negotiation + ký OTP + 4 loại PaymentCondition + amendment |
| flow-02-chapter-production | 100 | chapter-first + Name gate + page/manuscript + publish gate + hold + ending |
| flow-03-task-studio | 70 | danh bạ + invite→assignment + region cascade + task lifecycle + presign R2 |
| flow-04-voting-ranking | 70 | guest OTP vote + anti-spam + merge 2 nguồn + tie-break + at-risk tiering |
| flow-05-lifecycle | 46 | hiatus/resume + TIME_BOUND pause + board CANCEL/COMPLETE/FORMAT + ending allowance |
| flow-07-reprint | 55 | AS_IS/WITH_REVISION + ownership branch + auto-publish |
| flow-08-transfer | 74 | Mô hình A (FULL_BUYOUT) + ký 3 bên (REVENUE_SHARE) + co-owner approve |
| flow-10-deadline | 29 | propose/counter/agree turn-taking + finalize + board-resolve |
| flow-12-13-franchise-publication | 19 | franchise consent gate + PublicationVersion CRUD |
| cross-rbac-sweep | 1350 | 226 route × (none + 5 role) |
| cross-cron | 22 | otp-cleanup, orphan-asset, deadline-warning, coowner-escalation, hiatus-too-long, TIME_BOUND, board-scheduler |
| cross-events | 15 | NameApproved, ContractAmendmentRequested, availability, chapter.published, series.serialized/cancelling, hiatus, RankingFinalized, flip-terminal |
| cross-ws | 6 | handshake JWT, roster guard, broadcast voteProgressUpdated |
| **TỔNG** | **1.974** | |

---

## Quy ước viết case

- Mỗi assert 1 dòng: `ok('[F05-014] mô tả', điều_kiện, debug_info)`.
- Unhappy **PHẢI** assert cả status **và** mã lỗi: `expectError(res, 409, 'Error.SeriesNotSerialized', '...')`.
- Side-effect async (notify/audit/event) → dùng `waitUntil(...)` (poll), **KHÔNG** `sleep` cứng.
- Happy-path chính của mỗi flow đi **qua API thật từ đầu**; fast-forward factory chỉ cho nhánh unhappy/phụ.
- Mỗi file tự `wipeDb()` + `seedRolesAndAdmin()` ở đầu → chạy độc lập được.
- **Phát hiện bug BE → KHÔNG sửa BE trong file test.** Ghi vào `FINDINGS.md`, để BE-A review.

## Regenerate bảng RBAC

`route-roles.ts` là **contract RBAC** — sinh từ metadata runtime, không sửa tay:
```bash
pnpm build && pnpm flowtest:one test/flows/_generate-route-roles.ts
```
Sweep so code với bảng: lệch = finding.

---

## 🔴 Gotcha (đã trả giá — đừng lặp lại)

1. **`REDIS_URL` phải là db index riêng (`/5`).** Dev server chạy cùng máy dùng db0. Nếu dùng chung,
   **worker BullMQ của dev server sẽ ăn job queue của flowtest** rồi ghi Notification vào **DB dev**
   → notification "biến mất" ngẫu nhiên khỏi DB flowtest (chính là loạt "cold-start flake" trước đây).
2. **`@prisma/client` tự load `.env`** (env DEV) vào `process.env` ngay khi import → ESM hoisting làm
   nhiễm `DATABASE_URL`/`REDIS_URL` **trước** khi `lib/env.ts` chạy. Vì vậy `lib/env.ts` **force override
   MỌI key**.
3. **`wipeDb()` KHÔNG xoá collection `Role`.** `RoleService` trong server cache `roleId` in-memory
   (không invalidate) → xoá role = user mới nhận roleId chết → login 500.
4. **KHÔNG `flushdb` Redis** giữa các file: phá state worker BullMQ đang blocking-listen. Chỉ DEL
   **targeted**: `rl:*` (rate-limit, trong `wipeDb`) và `cron:*` (trong `clearCronLocks`).
5. **Rate-limit OTP window = 1 giờ.** Không xoá `rl:*` → chạy suite 2–3 lần trong cùng giờ sẽ ăn 429
   hàng loạt (đỏ giả).
6. **`prisma db push` cho DB flowtest** — xem bước 3.

## Ngoài phạm vi (spec §20)

AI segmentation với ai-service thật (chỉ test nhánh 503 khi tắt) · upload/download bytes thật lên R2
(chỉ test presign + validate) · gửi email thật (OTP seed thẳng DB) · load/perf test · CI wiring.
