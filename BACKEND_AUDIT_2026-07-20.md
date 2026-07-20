# Báo cáo audit toàn bộ Backend

> ⚠️ **ĐỌC §13 TRƯỚC.** §1–§12 là ảnh chụp tại thời điểm audit và **đã lỗi thời một phần**: S-02 / S-03 / S-05 / F-03 / F-11 / F-12 nay ĐÃ FIX (2026-07-20, xem §13), và §3 ("full flow PASS 15/15") **sai kể từ khi S-01 land** — thực tế `cross-rbac-sweep` đỏ 1549/5. §13 ghi trạng thái đúng + 3 vấn đề chính audit này bỏ sót.

**Ngày kiểm tra:** 2026-07-20  
**Phạm vi:** toàn bộ `src/`, schema Prisma, cấu hình build/test/lint, Swagger, API HTTP, RBAC, WebSocket, cron, domain events, Redis, MongoDB và Cloudflare R2.  
**Chuẩn đối chiếu:** `AGENTS.md` và `ARCHITECTURE.md` tại root repository.  
**Nguyên tắc thực hiện:** không sửa source code; chỉ tạo báo cáo này.

## 1. Kết luận điều hành

Backend hiện **build được và toàn bộ 15 nhóm flow tích hợp chạy qua**, bao gồm API thật, MongoDB replica set, Redis, WebSocket, cron, event chain và upload/download PDF qua Cloudflare R2. Swagger boot được với **218 path / 259 operation**. Đây là bằng chứng mạnh rằng các happy path, state transition, RBAC và phần lớn nhánh lỗi đang vận hành đúng với dữ liệu thật.

Tuy nhiên repository **chưa ở trạng thái release-green** vì còn các bug, gate và nợ chính sau (đã cập nhật theo senior deep-dive tại mục 10):

1. Payment có lỗi object-level authorization và actor spoofing đã được chứng minh bằng API thật; đây là P0.
2. Contract signing và Payment generation/transition không an toàn dưới concurrency; có thể kẹt trạng thái, tạo payment trùng hoặc emit side effect trùng.
3. Event tài chính/hợp đồng chạy in-process, không có outbox/replay/reconciliation nên có thể mất side effect sau DB commit.
4. Unit suite đỏ: 4 test fail trên 1.145 test, liên quan trực tiếp đến đợt chuẩn hóa error code đang làm dở.
5. Script e2e chính thức không chạy được test nào vì Jest không parse ESM của `@react-pdf/renderer`.
6. `pnpm audit --prod` báo 6 advisory, trong đó có 2 mức HIGH; `ws` là dependency thực sự được dùng bởi Board WebSocket.
7. 27/103 service class vi phạm ít nhất một ngưỡng tách service trong `AGENTS.md`, nhưng đây là maintainability debt và phải xếp sau các lỗi correctness/security.
8. Unit coverage tổng chỉ đạt 61,29% line và 46,52% function; các race/error path quan trọng chưa được test.

Full flow suite không phát hiện failure trên các kịch bản đã định nghĩa, nhưng vòng senior review bổ sung đã xác nhận **hai lỗi Payment qua API thật** và nhiều race condition chưa được flow tuần tự bao phủ. Vì vậy, kết quả 15/15 chỉ chứng minh happy path và các negative case hiện có; nó không chứng minh object-level authorization, tính nguyên tử hay an toàn khi request/event chạy đồng thời.

## 2. Baseline và tính toàn vẹn worktree

Trước audit, worktree đã có 4 file source đang được chỉnh sửa:

- `src/core/http/docs/error-text.registry.spec.ts`
- `src/core/security/errors/public-rate-limit.error.ts`
- `src/core/security/errors/rate-limit.errors.ts`
- `src/core/security/security.messages.ts`

Các thay đổi này thuộc baseline của người dùng, liên quan đến chuẩn hóa lỗi security/rate-limit. Audit chỉ đọc và kiểm thử trên đúng trạng thái đó, không sửa hoặc hoàn nguyên chúng. Sau toàn bộ kiểm tra, `git status --short` vẫn chỉ có 4 file baseline trên và file báo cáo mới này.

Inventory tại thời điểm audit:

- 556 file trong `src/`.
- 550 file TypeScript.
- 151 file `*.spec.ts`.
- 27 module nghiệp vụ dưới `src/modules/`.

## 3. Bằng chứng verification

| Gate | Kết quả | Bằng chứng chính |
|---|---:|---|
| Build | **PASS** | `pnpm build`, exit 0 |
| Prisma schema | **PASS** | `pnpm exec prisma validate`, schema hợp lệ |
| Lint read-only | **PASS có warning** | 0 error, 136 warning trên 23 file; không chạy script `lint --fix` để tránh sửa code |
| Unit test | **FAIL** | 148/151 suite pass; 1.141/1.145 test pass; 4 fail |
| Unit coverage | **Cảnh báo** | line 61,29%; statement 60,85%; function 46,52%; branch 54,08% |
| E2E script | **FAIL trước khi chạy test** | `pnpm test:e2e --runInBand` lỗi parse ESM `@react-pdf/renderer` |
| Boot/Swagger | **PASS** | server trả `/api-json`; 218 path, 259 operation |
| Full real-data flow | **PASS** | 15/15 nhóm pass trên `Mangaka-flowtest`, Redis DB riêng, R2 thật |
| Contract PDF/R2 | **PASS** | Flow 06: 85/85; PDF thật bắt đầu bằng `%PDF-`, presigned GET, idempotency và RBAC đều pass |
| Cron/R2 | **PASS có 1 case SKIP** | cross-cron: 22/22 assert pass; case object stale nhưng còn tồn tại trên R2 được harness đánh dấu SKIP |
| Dependency audit | **FAIL** | 2 HIGH, 3 MODERATE, 1 LOW advisory |

### Full flow đã chạy

Lượt cuối chạy `pnpm flowtest` với quyền truy cập R2 trả exit 0 cho toàn bộ:

- `flow-11-auth-identity.ts`
- `flow-01-serialization.ts`
- `flow-06-contract-payment.ts`
- `flow-02-chapter-production.ts`
- `flow-03-task-studio.ts`
- `flow-04-voting-ranking.ts`
- `flow-05-lifecycle.ts`
- `flow-07-reprint.ts`
- `flow-08-transfer.ts`
- `flow-10-deadline.ts`
- `flow-12-13-franchise-publication.ts`
- `cross-rbac-sweep.ts` — 1.554/1.554 probe pass
- `cross-ws.ts` — 13/13 pass
- `cross-cron.ts` — 22/22 assert pass
- `cross-events.ts` — 17/17 pass

Flow 11 đạt 86/86, Flow 01 đạt 123/123 và Flow 06 đạt 85/85. Full flow dùng database `Mangaka-flowtest` và không dùng database production.

## 4. Findings theo mức ưu tiên

### F-01 — HIGH — Error-code migration đang dở làm unit gate đỏ và API contract chưa đồng nhất

**Bằng chứng**

- `src/core/http/docs/error-text.registry.spec.ts:35` thêm convention guard `Error.PascalCase`.
- Guard mới phát hiện **27 catalog code** và **35 translation key** không đúng format.
- `src/modules/payment/payment.messages.ts:3`–`14` vẫn dùng `SCREAMING_SNAKE_CASE`.
- `src/modules/transfer/transfer.messages.ts:3`–`17` vẫn dùng phần lớn `SCREAMING_SNAKE_CASE`.
- `src/modules/contract/errors/contract.errors.ts:14`–`98` vẫn còn các code như `CONTRACT_NOT_FOUND`, `REVENUE_NOT_APPLICABLE` và `MangakaSignNotRequired`.
- `src/modules/auth/services/auth-otp.service.spec.ts:114` vẫn kỳ vọng `AUTH_OTP_RATE_LIMITED`.
- `src/core/security/guards/public-rate-limit.guard.spec.ts:37` vẫn kỳ vọng `PUBLIC_RATE_LIMITED`.

**Tác động**

- FE phải phân nhánh trên nhiều kiểu code khác nhau.
- Đợt đổi security code hiện tại có thể breaking với FE nếu deploy khi chưa đồng bộ.
- Unit suite không còn là release gate tin cậy cho đến khi source, translation registry, docs và test cùng chốt một contract.

**Khuyến nghị**

- Chốt migration contract với FE trước khi đổi các code legacy.
- Chuẩn hóa theo một bảng mapping có version hoặc giai đoạn tương thích; cập nhật đồng thời error factories, message catalogs, translation keys, Swagger docs và test.
- Không bỏ convention test mới; dùng nó làm regression guard sau khi migration hoàn tất.

### F-02 — HIGH — E2E script chính thức bị hỏng bởi ESM/CJS incompatibility

**Bằng chứng**

- `pnpm test:e2e --runInBand` fail trước khi chạy test: `SyntaxError: Cannot use import statement outside a module`.
- Chuỗi import: `test/app.e2e-spec.ts:5` → `src/app.module.ts` → Contract module → `src/infrastructure/pdf/pdf-render.service.ts:2` → `@react-pdf/renderer`.
- `test/jest-e2e.json:7` dùng `ts-jest` theo cấu hình CommonJS và không cấu hình transform ESM dependency.
- Kết quả: 1 suite fail, **0 test được chạy**.

**Tác động**

- Lệnh e2e được khai báo trong `package.json` nhưng không thể dùng làm CI gate.
- Boot regression ở AppModule có thể lọt nếu CI chỉ gọi `test:e2e` và hiểu nhầm đây là lỗi test đơn lẻ.

**Khuyến nghị**

- Chọn một hướng nhất quán: cấu hình Jest ESM/transform cho `@react-pdf/renderer`, hoặc mock/lazy-load PDF renderer trong app-level e2e.
- Thêm `pnpm test:e2e` vào CI sau khi gate này chạy thật và pass.

### F-03 — HIGH — Dependency audit có 2 advisory HIGH, một advisory nằm trên WebSocket runtime path

`pnpm audit --prod --json` báo:

| Mức | Package hiện tại | Advisory | Bản vá |
|---|---|---|---|
| HIGH | `ws` 8.20.1 qua Socket.IO/Engine.IO | Memory exhaustion DoS từ tiny fragments/data chunks | `>=8.21.0` |
| HIGH | `multer` 2.1.1 qua `@nestjs/platform-express` | DoS qua deeply nested field names | `>=2.2.0` |
| MODERATE | `multer` 2.1.1 | Cleanup không đầy đủ khi upload bị abort | `>=2.2.0` |
| MODERATE | `ts-deepmerge` 6.2.1 qua `@anatine/zod-openapi` | Prototype method override dẫn tới DoS | `>=8.0.0` |
| MODERATE | `js-yaml` 4.1.1 | Quadratic-complexity DoS | `>=4.1.2` |
| LOW | `esbuild` 0.28.0 | Dev server trên Windows có thể đọc file tùy ý | `>=0.28.1` |

`ws` có runtime reachability rõ ràng qua `src/modules/board/board.gateway.ts:10` và `@WebSocketGateway` tại dòng 24. Không tìm thấy `FileInterceptor`, `MulterModule` hoặc multipart handler trong `src`, nên exploitability hiện tại của Multer thấp hơn `ws`, nhưng package vẫn nằm trong production dependency tree.

**Khuyến nghị**

- Ưu tiên nâng chuỗi Socket.IO/Engine.IO để nhận `ws >=8.21.0` và regression-test `cross-ws`.
- Nâng Nest platform/override transitive để nhận `multer >=2.2.0`; xác minh lại ngay cả khi app hiện dùng presigned R2 thay vì multipart.
- Rà lại các dependency tooling/docs để loại khỏi production image nếu không cần lúc runtime.
- Chạy lại `pnpm audit --prod` sau update và lưu audit thành CI gate có policy rõ ràng.

### F-04 — MEDIUM — 27 service class vi phạm ngưỡng tách service bắt buộc

`AGENTS.md` yêu cầu tách service nếu **bất kỳ** điều kiện nào đúng: trên 200 dòng, trên 4 use-case method hoặc trên 6 dependency.

Kết quả AST scan trên 103 service class:

- 11 service trên 200 dòng.
- 27 service trên 4 public use-case method.
- 5 service trên 6 constructor dependency.
- Tổng cộng 27/103 service vi phạm ít nhất một ngưỡng.

Hotspot lớn nhất:

| Service | Dòng | Dependency | Public method |
|---|---:|---:|---:|
| `survey/services/survey.service.ts` | 768 | 12 | 19 |
| `contract/services/contract.service.ts` | 638 | 8 | 17 |
| `board/services/board.service.ts` | 485 | 8 | 18 |
| `reprint/services/reprint-request.service.ts` | 411 | 4 | 10 |
| `payment/services/payment-engine.service.ts` | 410 | 3 | 10 |
| `name/name.service.ts` | 371 | 5 | 17 |
| `transfer/services/transfer.service.ts` | 349 | 3 | 13 |
| `contract/services/contract-amendment.service.ts` | 294 | 5 | 9 |
| `payment/services/payment.service.ts` | 287 | 4 | 13 |
| `series/services/series-proposal.service.ts` | 283 | 5 | 12 |
| `series/services/series-lifecycle.service.ts` | 227 | 5 | 8 |

Các facade `chapter.service.ts` và `users.service.ts` cùng inject 10 dependency; chúng mỏng hơn nhưng vẫn vượt ngưỡng dependency/method theo rule hiện hành.

**Tác động**

- Tăng coupling, blast radius và chi phí review.
- Khó phân định state writer và khó test độc lập từng use case.
- Contract/Payment/Transfer cũng chính là các vùng có uncovered unit lines cao.

**Khuyến nghị**

- Tách theo vertical use case, ưu tiên Survey, Contract, Board rồi Payment/Transfer.
- Giữ facade chỉ nếu `AGENTS.md` được sửa để công nhận facade delegation là ngoại lệ; hiện tại rule không có ngoại lệ này.

### F-05 — MEDIUM — Boundary state machine chưa đồng nhất và transition chưa được ghi có điều kiện

Các module Series/Chapter/Task đã có state service rõ ràng, nhưng một số module vẫn ghi trạng thái trực tiếp trong domain service lớn:

- Contract: `src/modules/contract/services/contract.service.ts:260`, `320`, `343`, `375`, `401`, `445`.
- Contract Amendment: `src/modules/contract/services/contract-amendment.service.ts:152`, `264`, `282`.
- Payment: `src/modules/payment/services/payment.service.ts:79`, `110`, `143`, `247`.
- Transfer: `src/modules/transfer/services/transfer.service.ts:89`, `111`, `157`, `183`, `204`, `225`.
- Reprint: `src/modules/reprint/services/reprint-request.service.ts:138`, `210`, `260`, `282`, `309`, `342`.
- Name: `src/modules/name/name.service.ts:97`, `133`, `183`, `249`.

Việc một module chưa đặt tên class là `<entity>-state.service.ts` tự nó chưa chứng minh có nhiều writer. Vấn đề thực chất là boundary không đồng nhất và nhiều transition dùng mẫu `read/assert -> update({ where: { id } })`, không khóa trạng thái nguồn. Hai request đối nghịch có thể cùng vượt qua assert rồi ghi đè nhau theo kiểu last-write-wins. Series proposal đã có bounded CAS, nhưng `SeriesStateService.transition()` và nhiều transition Contract/Payment vẫn chưa dùng guard tương đương.

**Khuyến nghị:** gom `assert transition + conditional write/CAS + statusHistory/audit` vào một boundary duy nhất cho từng aggregate. Ưu tiên tính nguyên tử và invariant trước việc tách class chỉ để đạt ngưỡng dòng code.

### F-06 — MEDIUM — Unit coverage thấp ở các vùng nghiệp vụ quan trọng

Coverage đo trên toàn unit suite hiện tại (dù suite có 4 failure, Jest vẫn xuất coverage):

- Lines: 5.366/8.755 — **61,29%**.
- Statements: 6.165/10.130 — **60,85%**.
- Functions: 896/1.926 — **46,52%**.
- Branches: 3.450/6.379 — **54,08%**.

Lượng executable line chưa cover lớn nhất:

| File | Line coverage | Uncovered line |
|---|---:|---:|
| `contract/services/contract.service.ts` | 50,93% | 105 |
| `chapter/chapter.repo.ts` | 4,8% | 99 |
| `contract/contract.controller.ts` | 0% | 84 |
| `payment/services/payment-engine.service.ts` | 42,14% | 81 |
| `transfer/services/transfer.service.ts` | 35,18% | 70 |
| `payment/services/payment.service.ts` | 40,4% | 59 |
| `board/services/board.service.ts` | 73,77% | 48 |
| `survey/services/survey.service.ts` | 83,01% | 45 |
| `auth/services/auth-token.service.ts` | 17,3% | 43 |

Full flow suite bù được nhiều integration risk, nhưng unit coverage thấp khiến việc refactor các hotspot khó an toàn và khó khoanh vùng regression.

**Khuyến nghị:** đặt threshold tăng dần theo module, ưu tiên branch/state transition và race/error paths thay vì chạy theo line coverage thuần túy.

### F-07 — MEDIUM — Contract controller chứa business dispatch/exception logic

`src/modules/contract/contract.controller.ts:165`–`172` tự kiểm tra `ContractStatus`, chọn use case và throw `ContractErrors.InvalidStatus()`.

Điều này lệch nguyên tắc controller chỉ nhận input, gọi service và trả output. Contract controller cũng có 29 handler và dài khoảng 506 dòng, nên nhánh nghiệp vụ trong controller dễ tiếp tục tăng.

**Khuyến nghị:** chuyển việc dispatch/validate transition vào application service; controller chỉ gọi một method với DTO đã validate.

### F-08 — MEDIUM — RoleService truy cập Prisma trực tiếp ngoài repository boundary

`src/modules/auth/services/role.service.ts:3`, `9`, `15` import/inject `PrismaService` và gọi `role.findUniqueOrThrow()` trực tiếp. Đây là trường hợp duy nhất static scan tìm thấy trong các `*.service.ts` production.

**Tác động:** phá repository-only data-access rule và làm cache behavior gắn trực tiếp với persistence implementation.

**Khuyến nghị:** đưa lookup vào Auth/User repository hoặc một RoleRepository nhỏ; giữ RoleService quản lý cache/orchestration.

### F-09 — LOW — Seed script có floating promise và lifecycle DB chưa được await

ESLint production warnings nằm tại:

- `src/initialScript/index.ts:11`: `prisma.$connect()` không await/catch.
- `src/initialScript/index.ts:76`: `prisma.$disconnect()` trong `.finally()` không được return/await.

**Tác động:** lỗi connect có thể thành unhandled rejection; CLI có thể kết thúc hoặc treo trước khi disconnect hoàn tất. Đây là script vận hành dữ liệu nên failure handling cần deterministic.

### F-10 — LOW — Regex ObjectId bị sao chép ở 45 file

Static scan tìm thấy 45 file production khai báo riêng `const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/`. Guard này đang làm đúng nhiệm vụ ngăn Prisma P2023/500, nhưng mức lặp lớn tạo nguy cơ drift và tăng chi phí sửa.

**Khuyến nghị:** dùng một utility/predicate không phụ thuộc NestJS trong `core`, hoặc chuẩn hóa ObjectId schema/pipe dùng chung, vẫn giữ mapping 404 theo từng domain ở service.

### F-11 — LOW — Lint còn 136 warning; phần runtime nhỏ nhưng test debt lớn

- 133 warning `@typescript-eslint/no-unsafe-argument`.
- 3 warning `@typescript-eslint/no-floating-promises`.
- 134/136 warning nằm trong spec/flow test.
- 2 warning runtime đều ở seed script như F-09.

Không có ESLint error. Dù warning test không trực tiếp gây bug production, số lượng lớn làm giảm signal của lint và khiến warning mới dễ bị bỏ qua.

### F-12 — LOW — Production còn `console.log` trái checklist và flow docs đã drift

- `src/core/config/envConfig.ts:9` và `88` dùng `console.log`; checklist trong `AGENTS.md` yêu cầu 0 `console.log` trong production code.
- `test/flows/README.md` vẫn ghi baseline cũ 1.974 case, cross-RBAC 1.350 probe, Flow 11 là 58 case; lượt chạy hiện tại lần lượt cho thấy cross-RBAC 1.554 và Flow 11 là 86 case.

Đây là nợ chất lượng/logging và documentation, không phải lỗi nghiệp vụ.

### F-13 — LOW — Full flow pass nhưng vẫn có case đánh dấu SKIP

Các gap đáng chú ý trong harness:

- `test/flows/cross-cron.ts:137`: asset stale nhưng object **còn tồn tại** trên R2 phải được giữ — SKIP.
- `test/flows/flow-04-voting-ranking.ts:420`: phone rate-limit — SKIP vì vote body không expose phone.
- `test/flows/flow-02-chapter-production.ts:799`–`800`: annotation target not-found và delete non-author — đánh dấu ngoài scope.
- `test/flows/flow-02-chapter-production.ts:1014`: proposal-Name submit — đánh dấu ngoài scope của flow file.

Một số hành vi ngoài scope có thể đã được unit/flow khác cover, nhưng không nên diễn giải “15/15 file pass” thành “100% mọi nhánh đã test”. Case R2 object-exists là gap integration rõ ràng nhất.

## 5. Ma trận tuân thủ kiến trúc

| Quy tắc | Trạng thái | Nhận xét |
|---|---|---|
| Controller không inject repository/Prisma | **PASS** | AST scan không tìm thấy controller nào inject Repo/Prisma |
| Controller không chứa business logic | **PARTIAL** | Contract controller có status dispatch và throw domain error |
| Repository-only data access | **PARTIAL** | RoleService truy cập Prisma trực tiếp |
| Service split theo ngưỡng | **FAIL** | 27/103 service class vi phạm ít nhất một ngưỡng |
| State machine single-writer service | **PARTIAL** | Series/Chapter/Task rõ ràng; nhiều BE-B module ghi trực tiếp trong domain service |
| Một global exception filter | **PASS** | `APP_FILTER` đăng ký `CatchEverythingFilter` duy nhất |
| Success/error envelope | **PASS qua flow** | Swagger mô tả envelope; full API flow đọc envelope thành công |
| Validation trả 422 | **PASS qua flow/scan** | Global Zod pipe; nhiều negative case trả 422 đúng |
| User-facing message tập trung | **PARTIAL** | Không tìm thấy literal exception trong service/controller, nhưng error-code catalog còn legacy |
| Không dùng `{ deletedAt: null }` | **PASS scan** | Chỉ xuất hiện trong comment cảnh báo; code dùng `isSet:false` |
| Không dùng `z.coerce.boolean()` cho query/env | **PASS scan** | Không có usage production; `READ_CACHE_ENABLED` parse enum rõ ràng |
| ObjectId guard trước Prisma | **PASS nhưng lặp** | Guard phủ rộng; 45 bản sao regex |
| Build/Prisma | **PASS** | Build và schema validate đều xanh |
| Unit/e2e gate | **FAIL** | Unit 4 fail; e2e 0 test do ESM parse |
| Real DB/API/Redis/R2 test | **PASS có gap nêu trên** | 15/15 flow pass; một số case được đánh dấu SKIP |
| 0 lint error | **PASS** | 0 error; còn 136 warning |
| 0 console.log/TODO/FIXME production | **PARTIAL** | 2 `console.log` thực thi và 3 `console.log` trong comment; không có TODO/FIXME thực thi |

## 6. Điểm tốt đã được xác minh

- Full RBAC sweep 1.554 probe pass ở tầng role/route; object-level authorization vẫn có lỗ hổng Payment được nêu tại S-01.
- Refresh rotation, OTP lock/rate-limit, password policy và moderation đều chạy qua dữ liệu thật.
- Contract creation dùng Board Decision SERIALIZATION, embed Decision/Session và full signing lifecycle pass.
- PDF export thật qua R2 pass cả content, idempotency và access control.
- Claim race của Editor có đúng một người thắng.
- State transitions Series/Chapter/Task, event flip-terminal và cron idempotency đều được flow kiểm chứng.
- Không tìm thấy controller truy cập repository trực tiếp.
- Không tìm thấy hard-coded literal `throw new ...Exception('text')` trong production service/controller theo scan đã dùng.
- Soft-delete MongoDB dùng `isSet:false`; malformed ObjectId được guard rộng rãi.
- Redis cache fail-open, notifications/audit best-effort và event-after-write có test/flow bao phủ đáng kể.

## 7. Thứ tự xử lý khuyến nghị

1. Sửa Payment object ownership và actor identity; thêm integration test chéo tenant/owner.
2. Enforce idempotency/unique key cho Payment và transaction/CAS cho Payment transition, Contract signing/versioning.
3. Bổ sung outbox hoặc reconciliation cho event tài chính/hợp đồng.
4. Hoàn tất migration error code với FE; sửa e2e Jest/ESM và dependency HIGH để đưa release gate về xanh.
5. Bổ sung concurrency/failure-path test cho Contract và Payment.
6. Sau đó mới tách service lớn, dọn lint/seed/ObjectId/docs.

## 8. Các khoản nợ được loại khỏi scoring theo trao đổi

Hai mục sau không được tính là finding cần xử lý trong báo cáo này vì người dùng đã xác nhận có thể bỏ qua để FE/BE xử lý sau:

- TOCTOU khi gửi đồng thời `POST /contracts` có thể tạo hai draft; hướng triệt để là partial unique index.
- FE guide chưa có payload JSON example.

## 9. Giới hạn của audit

- Audit chứng minh những gì các command, static scans và flow suite hiện tại bao phủ; không thể khẳng định toán học rằng không còn bug ở mọi input/concurrency/failure mode.
- Server ở cổng 4100 đã chạy sẵn trước lượt boot riêng; lượt boot riêng nhận `EADDRINUSE`, nên Swagger và flow dùng chính server hiện hữu PID 18920. API response, database mutation flowtest và full suite exit 0 xác nhận server đó hoạt động, nhưng audit không dừng hoặc thay đổi tiến trình của người dùng.
- Dependency advisories là ảnh chụp registry tại ngày audit; cần chạy lại sau mỗi lần update lockfile.
- Coverage được tạo ở thư mục tạm, không thêm artifact coverage vào repository.

## 10. Senior deep-dive — bổ sung sau vòng review lần hai

Vòng này tập trung vào các failure mode mà flow tuần tự và role sweep không bắt được: BOLA/object ownership, actor spoofing, concurrent transition, idempotency tài chính, transaction boundary và mất domain event. Không sửa source code. Các fixture tạm dùng để chứng minh lỗi đều được xóa khỏi `Mangaka-flowtest` sau khi kiểm tra.

### S-01 — CRITICAL/HIGH — Payment thiếu object-level authorization và cho phép giả mạo người duyệt

**Bằng chứng static**

- `payment.controller.ts:37`–`43` cho Mangaka/Editor đọc `GET /payments/:id`, nhưng không truyền user hiện tại hoặc role xuống service.
- Các route theo contract/series/user tại dòng 76–97 cũng chỉ truyền ID từ URL; `payment.service.ts:162`–`177` không kiểm tra contract owner, series editor hoặc receiver.
- `payment.controller.ts:52`–`53` không lấy `@ActiveUser`; `approvedBy` do request body cung cấp và được lưu/audit trực tiếp tại `payment.service.ts:79`–`92`.
- `payPayment()` và `cancelPayment()` ghi `AuditLog.actorId = null` tại dòng 118–125 và 149–156 dù endpoint yêu cầu đăng nhập.

**Bằng chứng runtime bằng API thật**

- Tạo một PaymentRecord tạm không thuộc Mangaka thử nghiệm; đăng nhập Mangaka đó và gọi `GET /payments/:id` trả **HTTP 200**, đọc được amount `43210`.
- Gọi approve bằng Board token nhưng gửi `approvedBy` là ID của một user không liên quan trả **HTTP 200**; kiểm tra MongoDB cho thấy `status=APPROVED` và `approvedBy` đúng bằng ID giả do client gửi.

**Đánh giá**

Đây không phải nợ maintainability. Nó là lỗ hổng bảo mật và sai tính toàn vẹn audit: role guard chỉ xác nhận “là Mangaka/Editor/Board”, không xác nhận “được phép xem/thao tác record này”. Cần chặn release cho phần Payment nếu dữ liệu thanh toán là nhạy cảm.

**Hướng sửa**

- Mọi read Payment nhận `ActiveUser` và áp policy theo record/contract/series: receiver chỉ xem payment của mình; Editor chỉ xem contract/series mình phụ trách; Board/Admin theo policy đã chốt.
- Không nhận `approvedBy` từ body. Lấy actor từ access token; tương tự truyền actor thật vào pay/cancel và AuditLog.
- Thêm integration test chéo hai Mangaka, hai Editor và hai contract/series khác nhau; test cả by-id, by-user, by-contract và by-series.

### S-02 — HIGH — Contract signing không nguyên tử và có race làm sai trạng thái thực thi

**Bằng chứng**

- `contract.service.ts:456`–`535` đọc contract, đếm chữ ký hiện có rồi tính trạng thái tiếp theo trước khi ghi.
- `contract.repo.ts:237`–`265` tạo `ContractSignature` và cập nhật Contract bằng hai lệnh riêng, không transaction.
- Unique `[contractId, userId]` chỉ ngăn một người ký hai lần; nó không bảo vệ phép đếm tổng chữ ký hoặc trạng thái Contract.
- Flow 06 ký tuần tự, không có test hai chữ ký cuối chạy đồng thời hoặc lỗi xen giữa hai DB write.

**Failure mode cụ thể**

1. Cần 3 chữ ký, đã có 1; hai Board member cuối ký đồng thời. Cả hai cùng đếm 1 và cùng tính tổng mới là 2, nên cả hai signature được tạo nhưng không request nào chuyển Contract sang trạng thái hoàn tất.
2. Signature create thành công nhưng Contract update thất bại; retry bị unique/already-signed chặn và trạng thái Contract có thể kẹt.
3. Chữ ký cuối của Mangaka và Board chạy đồng thời trên snapshot cũ có thể ghi đè status/timestamp của nhau.

**Hướng sửa**

Dùng transaction cho signature + aggregate update, đồng thời CAS trên trạng thái/version của Contract. Trạng thái hoàn tất nên được suy ra lại từ signatures trong transaction, không dựa trên `count + 1` ngoài transaction. Thêm test concurrency thật bằng hai Promise/API request song song và fault-injection giữa hai write.

### S-03 — HIGH — Payment generation và transition chưa idempotent dưới concurrency

**Bằng chứng**

- `payment-engine.service.ts:274`–`306` dùng `existsPayment()` rồi `createTriggeredPayment()`; Prisma schema của `PaymentRecord` chỉ có index, không có composite unique cho `(contractId, conditionId, receiverId, paymentType, period)`.
- Hai event/retry đồng thời có thể cùng thấy “chưa tồn tại” và tạo hai payment tài chính giống nhau.
- Approve/pay/cancel đều theo mẫu read status rồi update theo `{ id }`; repo không guard `fromStatus`.
- Hai request pay đồng thời có thể cùng vượt qua `APPROVED`, cùng emit `payment.paid`; approve/pay/cancel đối nghịch có thể last-write-wins. Cancel lặp trên `CANCELLED` hiện vẫn được chấp nhận và audit lại.

**Hướng sửa**

Thiết kế idempotency key chuẩn hóa và enforce ở database bằng unique index; create theo insert-and-handle-duplicate. Transition dùng conditional update/CAS `where id + expected status`, chỉ bên thắng được emit event/audit. Consumer side effect cũng phải idempotent theo event/payment ID.

### S-04 — HIGH về độ tin cậy nghiệp vụ — Domain event quan trọng không có outbox/replay

`chapter.published`, `ranking.finalized`, `revenue.reported`, `series.cancelling` và hiatus event kích hoạt việc tạo payment hoặc đổi contract/condition qua EventEmitter trong process. Listener trả Promise nhưng producer dùng `eventEmitter.emit(...)`, không await hoàn tất listener. Không tìm thấy transactional outbox, event store, replay hay reconciliation job cho các side effect tài chính này.

Nếu process chết sau DB commit nhưng trước/đang lúc listener xử lý, hoặc listener lỗi, business write nguồn vẫn thành công nhưng payment/contract side effect có thể mất vĩnh viễn. Flow event pass chỉ chứng minh khi process và dependency đều khỏe.

**Hướng sửa:** transactional outbox ghi cùng transaction với aggregate; worker có retry/backoff, dedupe key và dead-letter/alert. Nếu chưa làm ngay, tối thiểu có reconciliation job so chapter/ranking/revenue với PaymentRecord và metric cho listener failure.

### S-05 — MEDIUM — ContractVersion có thể trùng versionNumber

- `ContractVersion` chưa có `@@unique([contractId, versionNumber])`.
- `contract.service.ts:284` tính `contract.versions.length + 1` từ snapshot ngoài transaction.
- Amendment cũng dựa trên `contract.versions.length + 1` tại `contract-amendment.repo.ts:123`.

Hai update/amendment đồng thời có thể cùng tạo một version number. Cần unique compound index và cấp version bằng transaction/CAS/counter; xử lý duplicate bằng retry có giới hạn.

### S-06 — MEDIUM/LOW — Notification và cache đang chọn availability hơn durability/consistency

- Phần lớn use case gọi thẳng `NotificationService.notifySafe()`. Chỉ một số cron/listener dùng `NotificationQueue`; vì `notifySafe` nuốt lỗi, notification có thể mất và không replay được. Đây là policy best-effort hợp lệ nếu product chấp nhận, nhưng tài liệu kiến trúc không nên mô tả toàn bộ notification là queued/durable.
- Cache invalidation dùng version bump và fail-open. Nếu DB write thành công nhưng Redis `INCR` lỗi, client có thể thấy dữ liệu cũ tối đa TTL: public series 120 giây, vote context 60 giây, ranking shared 600 giây. Đây là bounded-staleness debt, không phải lỗi nghiêm trọng nếu SLA chấp nhận mức này.

Khuyến nghị phân loại notification theo criticality: thông báo thuần UX có thể best-effort; deadline, approval hoặc payment cần queue/outbox. Ghi rõ consistency SLA của cache và thêm metric/alert cho bump failure.

### S-07 — LOW — EventEmitter được khởi tạo root ở hai module

`EventEmitterModule.forRoot()` xuất hiện cả `AppModule` và global `CoreModule`. Dù flow event hiện pass, cấu hình root trùng làm ownership hạ tầng khó hiểu và có nguy cơ tạo provider/config khác nhau khi nâng phiên bản. Chỉ nên có một composition root; module con import module đã cấu hình thay vì gọi `forRoot()` lần nữa.

## 11. Phân loại nợ và thứ tự xử lý sau senior review

| Nhóm | Mục | Quyết định |
|---|---|---|
| Bug bảo mật/toàn vẹn | S-01 Payment BOLA + actor spoofing | **P0, chặn release Payment** |
| Bug concurrency tài chính/hợp đồng | S-02, S-03 | **P0/P1, sửa trước refactor hình thức** |
| Rủi ro mất side effect | S-04 | **P1, cần outbox hoặc reconciliation có SLA** |
| Release gate/toolchain | F-01, F-02, F-03 | **P1**, phối hợp FE cho error migration |
| Data integrity trung hạn | S-05, F-05 | **P1/P2** |
| Maintainability/governance | F-04, F-07, F-08, F-10 | **P2**, không refactor chỉ vì line count trước P0/P1 |
| Accepted/bounded debt | S-06 cache/notification, F-09, F-11–F-13 | **P2/P3**, ghi SLA và theo dõi |

Lộ trình khuyến nghị:

1. Khóa object-level authorization Payment và actor identity; thêm regression test chéo ownership.
2. Bổ sung DB uniqueness/idempotency cho Payment và CAS/transaction cho Payment transition, Contract signing/versioning.
3. Thêm concurrency tests; không dùng flow tuần tự làm bằng chứng cho race safety.
4. Thiết kế outbox/reconciliation cho event tạo tiền hoặc đổi trạng thái hợp đồng.
5. Đưa unit/e2e/dependency gates về xanh.
6. Sau đó mới tách các service lớn và dọn nợ naming/lint/docs.

## 12. Trạng thái sau đợt implement tiếp theo — re-verify 2026-07-20

Quy ước: `[x] DONE` chỉ dùng khi code hiện tại và verification phù hợp đều chứng minh finding đã được xử lý; `[~] PARTIAL` là đã sửa đúng một phần nhưng gate/invariant chưa khép kín; `[ ] OPEN` là chưa có thay đổi đủ để giải quyết finding.

### Checklist findings ban đầu

| Finding | Trạng thái | Bằng chứng re-verify |
|---|---|---|
| F-01 Error-code migration | [x] **DONE phía BE** | Unit suite 151/151, 1.160/1.160 test pass; convention registry không còn fail. Việc phối hợp version/rollout với FE vẫn là công việc phát hành ngoài code BE. |
| F-02 Jest E2E ESM/CJS | [~] **PARTIAL** | Mapper mock cho `@react-pdf/renderer` giúp 1/1 e2e test thực sự chạy và pass. Tuy nhiên Jest còn open handle, process không tự thoát và command timeout sau 180 giây; chưa đạt CI-green. |
| F-03 Dependency advisories | [ ] **OPEN** | `pnpm audit --prod` vẫn báo 6 vulnerability: 2 high, 3 moderate, 1 low; `ws` và `multer` HIGH chưa được nâng. |
| F-04 Service split threshold | [ ] **OPEN** | Không có đợt tách các hotspot Survey/Contract/Board/Payment; ContractService còn tăng thêm orchestration method. |
| F-05 Atomic state boundary | [ ] **OPEN** | Việc chuyển dispatch khỏi controller là tốt nhưng transition Contract/Payment vẫn read/assert rồi update theo ID, chưa CAS/conditional update. |
| F-06 Coverage vùng nghiệp vụ | [ ] **OPEN** | Có thêm test Payment S-01 nhưng chưa có coverage gate mới hoặc test concurrency cho các vùng rủi ro cao. |
| F-07 Business dispatch trong ContractController | [x] **DONE** | Controller chỉ gọi `contractService.updateStatusByWorkflow()`; validate/dispatch/throw đã chuyển xuống service. Build và unit suite pass. |
| F-08 RoleService truy cập Prisma trực tiếp | [x] **DONE** | Role lookup đã chuyển vào `AuthRepository.findRoleIdByCode()`; scan production service không còn `PrismaService` trực tiếp. |
| F-09 Seed floating promise/lifecycle | [x] **DONE** | `$connect()` và `$disconnect()` được await; entrypoint dùng `void initDB()` và lỗi được xử lý trong `try/catch/finally`. |
| F-10 ObjectId regex duplication | [ ] **OPEN** | Chưa có utility/schema dùng chung; bản sao regex vẫn tồn tại rộng. |
| F-11 Lint warnings | [ ] **OPEN** | Read-only ESLint hiện báo 135 vấn đề: 1 error Prettier mới trong `flow-06-contract-payment.ts:517` và 134 warning. Gate còn tệ hơn baseline 0 error. |
| F-12 console/docs drift | [~] **PARTIAL** | `envConfig.ts` đã bỏ `console.log`; vẫn còn `console.log` thực thi trong seed và flow README chưa được chứng minh đã cập nhật. |
| F-13 Flow SKIP/gaps | [ ] **OPEN** | Không có thay đổi nhắm vào các case SKIP/out-of-scope đã liệt kê. |

### Checklist senior deep-dive

| Finding | Trạng thái | Bằng chứng re-verify |
|---|---|---|
| S-01 Payment BOLA + actor spoofing | [x] **DONE** | Controller truyền `ActiveUser`; service enforce receiver/contract/series ownership; approve/pay/cancel dùng actor từ token. Unit regression pass và Flow 06 chạy API/DB/R2 thật đạt 94/94, gồm outsider 403 và `approvedBy` không thể giả mạo. |
| S-02 Contract signing atomicity/race | [ ] **OPEN** | `executeBoardSignature()` vẫn tạo signature và cập nhật Contract bằng hai write không transaction; logic vẫn đếm chữ ký trước write; chưa có concurrency test. |
| S-03 Payment concurrency/idempotency | [ ] **OPEN** | `createPaymentOnce()` vẫn `existsPayment -> create`; schema chưa có unique idempotency key. Approve/pay/cancel vẫn update theo ID, chưa guard expected status/CAS. |
| S-04 Durable domain events | [ ] **OPEN** | Chưa có outbox, replay hoặc reconciliation cho các event tài chính/hợp đồng. |
| S-05 ContractVersion uniqueness | [ ] **OPEN** | Schema vẫn chưa có `@@unique([contractId, versionNumber])`; cách tính `versions.length + 1` vẫn tồn tại. |
| S-06 Notification/cache policy | [ ] **ACCEPTED/UNCHANGED** | Vẫn best-effort/fail-open. Không phải blocker nếu product chính thức chấp nhận bounded staleness và notification loss; chưa có SLA/monitoring mới trong diff. |
| S-07 Duplicate EventEmitter root | [x] **DONE** | `EventEmitterModule.forRoot()` chỉ còn ở `AppModule`; `CoreModule` không khởi tạo root lần hai. Build/unit/Flow 06 pass. |

### Gate snapshot của lần re-verify

| Gate | Kết quả mới |
|---|---:|
| `pnpm build` | **PASS** |
| `prisma validate` | **PASS** |
| Unit | **PASS — 151/151 suite, 1.160/1.160 test** |
| E2E assertions | **PASS — 1/1**, nhưng command không thoát vì open handle → **PARTIAL** |
| Flow 06 API + Mongo + Redis + R2 | **PASS — 94/94** |
| ESLint read-only | **FAIL — 1 error, 134 warning** |
| Dependency audit production | **FAIL — 2 high, 3 moderate, 1 low** |

Tổng hợp: **6 finding DONE** (`F-01`, `F-07`, `F-08`, `F-09`, `S-01`, `S-07`), **2 PARTIAL** (`F-02`, `F-12`), **1 accepted nhưng chưa harden** (`S-06`), còn lại **OPEN**. P0 bảo mật S-01 đã được khép kín; rủi ro cao nhất còn lại là S-02/S-03/S-04 về contract/payment concurrency và event durability.

---

**Xác nhận thay đổi:** audit không sửa source code, schema, test, cấu hình, database production hoặc Redis production. File duy nhất được tạo bởi audit là `BACKEND_AUDIT_2026-07-20.md`.

---

## 13. Đợt fix của BE-A — 2026-07-20 (sau audit), verify bằng output chạy thật

> Scope do user chốt: **"Correctness + gate"** — sửa S-02 / S-03 / S-05 / F-03 / F-11 / F-12.
> **Cố ý HOÃN:** S-04 (outbox) và F-04 (tách 27 service) — lý do ở §13.3.
> Chi tiết đầy đủ + runbook deploy: `Docs/Epic-UserStory/PROGRESS-BE-A.md` §73.

### 13.1. Trạng thái sau đợt fix

| Finding | Trạng thái | Bằng chứng |
|---|---|---|
| S-02 Contract signing atomicity/race | [x] **DONE** | `recordBoardSignatureAndSettle` + `recordMangakaSignatureAndSettle` chạy trong `$transaction`, **đếm lại chữ ký bên trong tx**, CAS `settleFullyExecuted` nên chỉ một request emit `contract.executed`. Flow 06 **94/94**. Đã xoá `executeBoardSignature`. |
| S-03 Payment concurrency/idempotency | [x] **DONE** | `@@unique payment_idempotency` + `createPaymentOnce` nuốt P2002 → trả null + CAS `updateWithExpectedStatus` cho approve/pay/cancel (người thua không audit/emit). Probe DB thật: trùng → P2002; khác receiver/period → vẫn insert. |
| S-05 ContractVersion uniqueness | [x] **DONE** | `@@unique([contractId, versionNumber])` + `@@index([contractId])`; cấp số **trong transaction** ở cả 2 site + `withVersionRetry` (nếu không có retry thì chỉ đổi bug thầm lặng lấy lỗi 500). |
| F-03 Dependency advisories | [x] **DONE** | overrides ở `pnpm-workspace.yaml` (⚠ pnpm 11 KHÔNG đọc `pnpm.overrides` trong package.json). `pnpm audit --prod` → **No known vulnerabilities found** (từ 6, gồm 2 HIGH). |
| F-11 Lint error | [x] **DONE** | **0 error** / 136 warning. |
| F-12 console/docs drift | [x] **DONE (phần console)** | `initialScript` dùng Nest `Logger`. |
| S-04 Durable domain events | [ ] **HOÃN có chủ đích** | xem §13.3 |
| F-04 / F-06 / F-10 / F-02 / F-13 | [ ] **OPEN** | không nằm trong scope đợt này |

### 13.2. 🔴 Ba vấn đề audit này BỎ SÓT (BE-A tìm ra khi verify — đều đã fix)

1. **Dedupe payment chưa bao giờ chạy — bug tiền thật, KHÔNG cần concurrency.**
   `createTriggeredPayment` ghi `conditionId ?? undefined` (**ABSENT**) trong khi `existsPayment` query `conditionId: null`; Mongo/Prisma **không match doc absent**. Với mọi REVENUE_SHARE/COMPENSATION, lớp dedupe câm hoàn toàn.
   **Bằng chứng:** `prisma db push` lên DB flowtest **FAIL E11000 vì đã tồn tại 4 bản REVENUE_SHARE trùng hệt nhau** do chính ứng dụng tạo ra.
   ⇒ Audit xếp S-03 thuần "race condition" là **chưa đủ**: lỗi xảy ra ở luồng tuần tự bình thường.

2. **Cùng gotcha suýt vô hiệu hoá luôn fix S-02.** CAS đầu tiên viết `where: { boardSignedAt: null }` — contract chưa ký có field ABSENT ⇒ CAS không khớp ⇒ hợp đồng không bao giờ chốt. **1176 unit test xanh hết**, chỉ flowtest DB thật bắt được. Đã sửa thành `OR: [{ x: null }, { x: { isSet: false } }]`.

3. **§12 tự đánh S-01 DONE nhưng không chạy lại full flowtest.** `cross-rbac-sweep` đang **1549/5 FAIL** ngay trên baseline `bb51673` (BE-A xác minh bằng `git stash` rồi chạy lại trên code gốc). Commit S-01 thêm object-level authz cho 3 route payment read, phá giả định của sweep ("id giả → 404 trước khi so scope"); service trả **403 thay vì 404 để không lộ sự tồn tại** — đúng về bảo mật, nhưng sweep chưa được cập nhật. Đã thêm `OBJECT_SCOPED_ROUTES` → **1554/0**.
   ⇒ Câu "Full real-data flow PASS 15/15" ở §3 đã **lỗi thời** kể từ khi S-01 land.

### 13.3. Vì sao HOÃN S-04 (khác khuyến nghị của audit)

Audit xếp S-04 mức HIGH và đề xuất transactional outbox. BE-A đánh giá lại:
- Dựng outbox + worker retry + dead-letter + reconciliation là **một spec riêng cỡ Spec 23/24**, chạm mọi listener tài chính.
- Failure mode của nó (process chết đúng khe giữa DB commit và listener) **hiếm hơn nhiều** so với S-02 vốn đang hỏng ở luồng vận hành bình thường.
- Ưu tiên đúng phải là: khoá correctness trước (S-02/S-03/S-05), rồi mới bàn durability.
**Khuyến nghị nếu muốn hạ rủi ro mà chưa dựng outbox:** job reconciliation đối soát `chapter.published` / `ranking.finalized` / `revenue.reported` với `PaymentRecord`, kèm metric cho listener failure.

### 13.4. Gate snapshot sau đợt fix (chạy thật)

| Gate | Trước (§12) | Sau (§13) |
|---|---:|---:|
| `pnpm build` | PASS | **PASS** |
| `npx tsc --noEmit` | ~10 lỗi pre-existing đã dọn ở §71 | **0** |
| Unit | 1.160 / 151 suite | **1.176 / 151 suite** (+16 so với §12, +29 so với baseline §72) |
| `pnpm lint` | **FAIL — 1 error** | **PASS — 0 error**, 136 warning |
| `pnpm audit --prod` | **FAIL — 2 high, 3 moderate, 1 low** | **PASS — 0 vulnerability** |
| `pnpm flowtest` | 15/15 theo §3 nhưng **thực tế 13/15** (rbac-sweep đỏ) | **15/15 PASS, exit 0** |
| flow-06 | 94/94 | **94/94** |
| cross-rbac-sweep | **1549 / 5 FAIL** | **1554 / 0** |

⚠️ **Có schema delta** (2 unique index + 1 index) → deploy phải theo runbook `PROGRESS-BE-A.md` §73.6: chạy `scripts/migrate-payment-idempotency.mjs --dry-run` **TRƯỚC** `db push`; script **cố tình không tự xoá** bản trùng vì đó là bản ghi tiền.

**Chưa commit** — worktree giữ dirty để user tự review (17 file).
