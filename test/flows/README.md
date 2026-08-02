# Flow-Test Suite (Acceptance Test) — Flow 1–13

> Bộ acceptance test **end-to-end trên hệ thật**: server NestJS (port 4100) + MongoDB replica-set `rs0`
>
> - Redis + BullMQ + WebSocket + cron. Không mock gì cả.
>
> **Inventory (2026-08-01):** runner có **16 file**, bảng RBAC hiện có **273 route**; tổng bảng coverage là **2.386 case/probe**.
> Đây là inventory tài liệu, không phải tuyên bố full flow vừa được chạy lại.

## Vì sao cần (bổ sung cho unit test)

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

Các target test **bắt buộc đúng**:

```
NODE_ENV=test
TEST_DATABASE_URL="mongodb://localhost:27017/mangaka_flow_test?replicaSet=rs0"
DATABASE_URL="mongodb://localhost:27017/mangaka_flow_test?replicaSet=rs0"
PORT=4100
TEST_REDIS_URL=redis://localhost:6379/5 # ⚠ db index 5 — CÔ LẬP khỏi dev server (xem §Gotcha)
REDIS_URL=redis://localhost:6379/5
AI_SERVICE_URL=                         # rỗng = AI tắt (test assert nhánh 503 fallback)
```

`TEST_DATABASE_URL` là authority của test harness; không được fallback sang `.env` dev. Tên database phải kết thúc
bằng `_test` (hoặc dùng prefix `ci_`/`ci-`). `DATABASE_URL` và `REDIS_URL` được giữ cùng target để process API test
khởi động từ `.env.flowtest`; guard sẽ ghi đè chúng bằng hai biến `TEST_*` trước khi flow truy cập hạ tầng.

### 3. 🔴 Tạo index cho DB flowtest (BẮT BUỘC — làm 1 lần)

```bash
node --env-file=.env.flowtest node_modules/prisma/build/index.js db push --skip-generate
node --env-file=.env.flowtest node_modules/ts-node/dist/bin.js \
  -r tsconfig-paths/register src/initialScript/bootstrap-mongo-indexes.ts
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
pnpm test:integration                            # tự load .env.flowtest nếu file tồn tại
```

Exit code: `0` = all pass · `1` = có FAIL · `2` = lỗi tiền đề (server chưa chạy / DB sai / thiếu index).

---

## Cấu trúc

```
test/flows/
├── lib/
│   ├── env.ts     # load .env.flowtest + guard TEST_DATABASE_URL/TEST_REDIS_URL trước mọi DB/Redis access
│   ├── http.ts    # req/ok/expectError/expectStatus/section/summary — đọc envelope {success,message,data}
│   ├── seed.ts    # prisma client + wipeDb + assertIndexesReady + ~15 fast-forward factory
│   ├── auth.ts    # login (cache theo email) + seedOtp (bcrypt '123456')
│   ├── ws.ts      # socket.io client cho namespace /board
│   └── cron.ts    # withCronContext (boot AppModule, stop cron tick, gọi .run() thủ công) + clearCronLocks + waitUntil
├── flow-01..13    # 12 file theo Flow của Requirement, gồm flow-01 admin-hardening supplement
├── cross-rbac-sweep.ts   # 273 route × 6 token = 1.638 probe
├── cross-ws.ts           # WebSocket board (auth handshake + room + broadcast)
├── cross-cron.ts         # 7 cron chạy THẬT (6 gọi trực tiếp + board-scheduler đợi tick)
├── cross-events.ts       # 10 cặp event emit→listen, verify side-effect DB
├── route-roles.ts        # ⚠ SINH TỰ ĐỘNG — RBAC contract
├── _generate-route-roles.ts   # generator: đọc Reflect metadata runtime từ dist/
└── run-all.ts            # runner
```

### Coverage hiện tại

| File                             |      Case | Nội dung                                                                                                                                                                            |
| -------------------------------- | --------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| flow-01-admin-hardening          |        19 | admin commitment guards + Board roster cap                                                                                                                                          |
| flow-11-auth-identity            |        58 | register/verify/login/refresh-rotation/forgot/admin-moderation/reputation Bayesian                                                                                                  |
| flow-01-serialization            |        87 | composite proposal → claim/release → single approval tới READY_TO_PITCH → pitch → board vote; 7 router-level legacy-route 404 checks                                                |
| flow-06-contract-payment         |        78 | contract negotiation + ký OTP + 4 loại PaymentCondition + amendment                                                                                                                 |
| flow-02-chapter-production       |       100 | chapter-first + chapter storyboard gate + page/manuscript + publish gate + hold + ending                                                                                            |
| flow-03-task-studio              |        70 | danh bạ + invite→assignment + region cascade + task lifecycle + presign R2                                                                                                          |
| flow-04-voting-ranking           |        70 | guest OTP vote + anti-spam + merge 2 nguồn + tie-break + at-risk tiering                                                                                                            |
| flow-05-lifecycle                |        46 | hiatus/resume + TIME_BOUND pause + board CANCEL/COMPLETE/FORMAT + ending allowance                                                                                                  |
| flow-07-reprint                  |        55 | AS_IS/WITH_REVISION + ownership branch + auto-publish                                                                                                                               |
| flow-08-transfer                 |        74 | Mô hình A (FULL_BUYOUT) + ký 3 bên (REVENUE_SHARE) + co-owner approve                                                                                                               |
| flow-10-deadline                 |        29 | propose/counter/agree turn-taking + finalize + board-resolve                                                                                                                        |
| flow-12-13-franchise-publication |        19 | franchise consent gate + PublicationVersion CRUD                                                                                                                                    |
| cross-rbac-sweep                 |      1638 | 273 route × (none + 5 role)                                                                                                                                                         |
| cross-cron                       |        22 | otp-cleanup, orphan-asset, deadline-warning, coowner-escalation, hiatus-too-long, TIME_BOUND, board-scheduler                                                                       |
| cross-events                     |        15 | StoryboardApproved, composite proposal approval, ContractAmendmentRequested, availability, chapter.published, series.serialized/cancelling, hiatus, RankingFinalized, flip-terminal |
| cross-ws                         |         6 | handshake JWT, roster guard, broadcast voteProgressUpdated                                                                                                                          |
| **TỔNG**                         | **2.386** |                                                                                                                                                                                     |

### Contract Spec 28

- Proposal là composite của Series; `storyboardPages` nằm trong proposal. Submit đưa proposal tới `PROPOSAL_REVIEW` và Series tới `IN_REVIEW`; Editor phụ trách approve một lần để proposal thành `PROPOSAL_APPROVED` và Series thành `READY_TO_PITCH` ngay.
- Storyboard là tài nguyên chỉ thuộc chapter, dùng `StoryboardStatus` và các route `/chapters/:id/storyboards`. Helper fixture tương ứng là `makeChapterStoryboardAt`; `makeChapterAt` chỉ nhận `storyboardId?` và không đồng bộ `chapterNumber` sang storyboard.
- Event approval là `StoryboardApproved { seriesId, storyboardId, chapterId }`. Listener chapter seed bốn production stage; Series không nghe event này để đổi status.
- Flow 01 giữ đủ bảy request HTTP tới lifecycle Series cũ và chỉ pass khi nhận đúng router-level `404` với message `Cannot METHOD /exact/path`.

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

1. **`TEST_REDIS_URL`/`REDIS_URL` phải là db index riêng (`/5`).** Dev server chạy cùng máy dùng db0. Nếu dùng chung,
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
6. **`prisma db push` + `bootstrap-mongo-indexes` cho DB `_test`** — xem bước 3.

## Ngoài phạm vi (spec §20)

AI segmentation với ai-service thật (chỉ test nhánh 503 khi tắt) · upload/download bytes thật lên R2
(chỉ test presign + validate) · gửi email thật (OTP seed thẳng DB) · load/perf test · CI wiring.
