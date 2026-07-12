# AGENTS.md — Backend Development Guide

> Đọc file này TRƯỚC khi viết/sửa code. Mọi PR phải tuân thủ.

## 1. Project Overview

- **Kiến trúc tổng thể, data flow, tech stack chi tiết** → xem `ARCHITECTURE.md` (đọc trước khi code).
- **Stack**: NestJS 11, Prisma 6 (MongoDB replica set `rs0`), Zod 4 + nestjs-zod, JWT HS256, bcrypt,
  `@nestjs/event-emitter` (domain events), AWS SDK v3 → Cloudflare R2 (object storage), Resend (email), pnpm.
- **Feature modules BE-A**: `auth`, `users`, `notification`, `reviews`, `series`, `chapter`,
  `annotation`, `storage`, `studio` (A4-a: CollaborationInvite/StudioAssignment/directory), `task`, `ai`
  (A4-b: Region/Task/TaskVersion + cascade A4→A3), `audit` (PA-06: AuditLog `@Global` dual-write + `GET /audit`),
  `app-config` (PA-10: registry tham số nghiệp vụ `@Global` + `GET/PATCH /admin/app-config`) (Creation & Production).
  **BE-B** (Commercial & Governance) **đã bắt đầu**: module
  `contract` (B1) **và** `board` (B5 — Board/Decision engine) đã có trong repo — **KHÔNG sửa hộ BE-B**
  (chỉ để sẵn convention dùng chung ở `core/`).
- **Quy tắc vàng**: Vertical slice (NestJS chuẩn). Mỗi module tự chứa đủ: controller(s), service(s), repo,
  schemas, dto, errors, (mapper/constant/ports nếu cần).
- **AI service** (`ai-service/`): process **Python FastAPI riêng** (KHÔNG phải NestJS module). Module `ai` gọi nó qua
  HTTP (`AI_SERVICE_URL` + `AI_SERVICE_API_KEY`); rỗng URL = AI tắt, fallback manual. Chạy/keys → `ai-service/README.md`.
- **`scripts/`** (smoke/dev local) **gitignored + exclude khỏi build** (`tsconfig.build.json` pin `rootDir: src`) — KHÔNG
  commit script TS ở root repo (nếu lọt vào build → output nest thành `dist/src/main.js`, prod container vỡ).

## 2. Folder Structure

```
src/
├── main.ts
├── app.module.ts                  # import feature modules + đăng ký global pipe/interceptor/filter
├── initialScript/                  # seed (role + super admin) — `pnpm seed`
|-- core/                           # app-level cross-cutting rules (@Global qua CoreModule)
|   |-- config/                     # envConfig (Zod, fail-fast)
|   |-- events/                     # DomainEventBus + domain-events.ts (contract dùng chung BE-A/BE-B)
|   |-- http/
|   |   |-- decorators/             # Swagger/http decorators (ApiErrors)
|   |   |-- docs/                   # ENUM_DOCS, ERROR_HINTS, zEnum/zRole helpers
|   |   |-- dto/                    # MessageResDto, EmptyBodyDto, ...
|   |   |-- filters/                # CatchEverythingFilter (bộ lọc lỗi DUY NHẤT)
|   |   |-- interceptors/           # ResponseEnvelopeInterceptor ({success,message,data})
|   |   |-- pipes/                  # CustomZodValidationPipe (422)
|   |   `-- http.messages.ts        # layer-level message catalog
|   |-- security/
|   |   |-- constants/              # role/auth type/rate-limit constants
|   |   |-- decorators/             # @Roles, @IsPublic, @ActiveUser, ...
|   |   |-- errors/                 # security-layer exceptions
|   |   |-- guards/                 # auth/roles/password/otp guards
|   |   |-- services/               # security-layer services (RateLimitService)
|   |   `-- security.messages.ts    # layer-level message catalog
|   `-- models/                     # shared entity schemas (user.model.ts, ...)
|-- infrastructure/                 # external adapters / technology details
|   |-- database/                   # PrismaService + prisma-error.helper
|   |-- crypto/                     # HashingService (bcrypt)
|   |-- token/                      # TokenService + JWT payload types
|   |-- email/                      # EmailService (Resend) + email.queue/processor + React-email templates
|   |-- queue/                      # BullMQ queue config + QueueService (email, notification)
|   |-- redis/                      # ioredis clients (general + BullMQ) + RedisService
|   |-- oauth/                      # GoogleTokenVerifierService (verify Google ID token)
|   `-- storage/                    # StorageService (R2 presigned URL)
└── modules/
    └── <name>/
        ├── <name>.module.ts
        ├── <name>.controller.ts     # có thể >1 controller / module (vd series + name)
        ├── <name>.service.ts        # Orchestrator (delegate tới use-case services)
        ├── <name>.repo.ts           # Module-level repository
        ├── <name>.mapper.ts         # (nếu cần) Prisma entity → response DTO (Date → ISO string)
        ├── <name>.messages.ts       # Message catalog (text thuần): response / notification / error (xem §7)
        ├── <name>.constant.ts       # (nếu cần) enum/const cấp module
        ├── ports/                   # (nếu cần) interface tích hợp cross-module (defer BE-B)
        ├── schemas/
        │   ├── <name>.model.ts      # Entity schemas
        │   └── <name>-schemas.ts    # Request/response schemas
        ├── dto/<name>.dto.ts
        ├── errors/<name>.errors.ts  # Exception const-instance (status + path); text lấy từ <name>.messages.ts
        └── services/                # Optional: use-case services + state services
            ├── <name>-<usecase>.service.ts
            └── <entity>-state.service.ts   # single-writer cho 1 state machine
```

## 3. Layer Responsibilities

| Layer | Responsibility | KHÔNG làm |
|-------|---------------|-----------|
| **Controller** | HTTP route, call orchestrator, return response | Không validate, không gọi repo trực tiếp |
| **Service (Orchestrator)** | Điều phối use-case services, validate business rules | Không Prisma detail, không `req`/`res` |
| **UseCase Service** | 1 nhóm nghiệp vụ độc lập | Không ghi `status` của state machine khác (gọi state service) |
| **State Service** | **Single-writer** cho 1 state machine (validate transition + audit history) | Không nghiệp vụ khác |
| **Repository** | Data access (Prisma) | Không business logic |
| **Mapper** | Prisma entity → response shape (Date → ISO string) | Không nghiệp vụ, không Prisma query |
| **Messages** (`<name>.messages.ts`) | Catalog text user-facing (response/notification/error) — **string thuần** | Không import NestJS, không logic, không tạo Exception |
| **Port** | Interface biên giới cho dependency của module khác (BE-B) | Không implement (defer + marker) |
| **Schema (Zod)** | Validation + type inference | Không throw HttpException |
| **DTO** | Swagger + controller return type | Không có logic |

## 4. Naming Conventions

| Loại | Convention | Ví dụ |
|------|-----------|-------|
| File | `kebab-case.ts` | `auth-registration.service.ts`, `series-state.service.ts` |
| Class | `PascalCase` | `AuthRegistrationService` |
| Variable/function | `camelCase` | `getUserById` |
| Constant | `SCREAMING_SNAKE_CASE` | `OTP_PURPOSE.REGISTER` |
| Type alias | `PascalCase` + `Type` | `RegisterBodyType` |
| Zod schema | `PascalCase` + `Schema` | `RegisterBodySchema` |
| DTO class | `PascalCase` + `Dto` | `RegisterBodyDto` |
| Exception | `PascalCase` + `Exception` (const instance) | `InvalidOTPException` |
| Message catalog | `PascalCase` + `Messages` (const object) | `AuthMessages.error.invalidOtp` |

## 5. Repository Placement Rule

| Loại | Vị trí | Khi nào tạo |
|------|--------|-------------|
| **Module repository** | `src/modules/<name>/<name>.repo.ts` | Module đó đang dùng method |
| **Shared repository** | Không tạo trong `src/core/` hoặc `src/infrastructure/` | Nếu 2+ modules cần chung data access thì thiết kế lại module boundary trước |

## 6. Service Boundary

Tách service theo use-case khi **bất kỳ** điều kiện nào:
- Service > 200 dòng
- Service có > 4 use-case methods
- Service có > 6 dependencies inject
- Có nhóm methods hoàn toàn độc lập

**Pattern**: 1 Orchestrator + N UseCase Services.
- Controller inject **chỉ** Orchestrator.
- Orchestrator delegate sang use-case services.
- State machine → tách **state service riêng** (single-writer, xem §9).

## 7. Error Handling & Response Envelope

### Message catalog (text tập trung — single source of truth)
- **Mọi message text user-facing** (success / notification / `Error.*` code) sống ở **`<name>.messages.ts`** mỗi module
  (layer dùng chung: `src/core/http/http.messages.ts`, `src/core/security/security.messages.ts`).
- File messages = **string thuần**, KHÔNG import NestJS, KHÔNG logic. Cấu trúc theo nhóm:
  ```typescript
  export const AuthMessages = {
    response: { otpSent: 'OTP sent successfully', /* ... */ },
    notification: { /* content thông báo, có thể là fn(reason) => `...` */ },
    error: { invalidOtp: 'Error.InvalidOTP', /* ... các code Error.* */ }
  } as const
  ```
- Service/guard/notification **KHÔNG hard-code chuỗi** — luôn gọi `XxxMessages.<group>.<key>`.
- Muốn sửa/i18n message → chỉ sửa 1 chỗ (file messages).

### Lỗi
- Exception dùng **const instance** pattern, đặt ở `errors/<name>.errors.ts`; phần **text lấy từ `<name>.messages.ts`**
  (errors file chỉ giữ HTTP status + path):
  ```typescript
  // <name>.messages.ts
  export const AuthMessages = { error: { invalidOtp: 'Error.InvalidOTP' } } as const
  // errors/<name>.errors.ts
  const E = AuthMessages.error
  export const InvalidOTPException = new UnprocessableEntityException([{ message: E.invalidOtp, path: 'code' }])
  ```
- `Error.*` là **code** (FE map sang text hiển thị), KHÔNG hard-code chuỗi tiếng Việt/hiển thị trong service.
- **Swagger:** tài liệu hoá lỗi qua `@ApiErrors(...exceptions)` (derive từ chính exception instance, single source). KHÔNG gõ tay `@ApiResponse` cho lỗi nghiệp vụ. Xem §12.
- **Validation fail = 422** (CustomZodValidationPipe), KHÔNG phải 400.
- **`CatchEverythingFilter` là bộ lọc lỗi DUY NHẤT** (safety net). Mọi lỗi chuẩn hóa về:
  ```json
  { "success": false, "statusCode": <n>, "message": "<string>", "errors": [ { "message": "...", "path": "..." } ] }
  ```
  - `message` **LUÔN là string**. Lỗi field-level (zod / domain `{message,path}[]`) → mảng issue đặt ở **`errors[]`**;
    `message` = message của issue duy nhất, hoặc `'Validation failed'` nếu nhiều issue. Lỗi không có field → **không** có `errors`.
  - Prisma P2002 → 409; lỗi không xác định → 500. KHÔNG bọc object lồng object / message-trong-message.

### Thành công
- **`ResponseEnvelopeInterceptor`** bọc mọi response thành công:
  ```json
  { "success": true, "message": "<...>", "data": <payload | null> }
  ```
  - Service trả object có field `message` (string) → `message` nâng lên top-level, phần còn lại là `data`
    (null nếu không còn field). Ngược lại → `message: "Success"`, `data` = payload nguyên vẹn.
  - Interceptor đăng ký **TRƯỚC** `ZodSerializerInterceptor` (Zod serialize DTO xong → envelope mới bọc).
  - ⚠️ Swagger DTO khai báo shape *chưa bọc*; response thật luôn bọc envelope (FE đọc `data`).

## 8. Cross-cutting: Events & Notification (Sprint 0)

- **Domain events** (`src/core/events/domain-events.ts`): contract dùng chung BE-A/BE-B, in-process qua
  `@nestjs/event-emitter`. Emit: `domainEventBus.emit(DomainEvent.X, payload)`; listen: `@OnEvent(DomainEvent.X)`.
  Emit event **SAU** khi DB write commit (không trong transaction).
- **NotificationService** (`@Global`): `notify({ recipientId, type, referenceId?, referenceType?, content? })`,
  idempotent theo (recipient + type + ref). Inject thẳng ở bất kỳ module nào.
- **AuditService** (`@Global`, PA-06): `record({ actorId, entityType, entityId, action, fromState?, toState?, reason? })` —
  **dual-write** bổ sung (GIỮ `statusHistory[]` embedded per-entity, THÊM collection `AuditLog` tập trung). **Best-effort**:
  tự nuốt lỗi + log, **KHÔNG BAO GIỜ throw** (mirror `notifySafe`); gọi **SAU** DB write chính commit, NGOÀI transaction.
  Mọi state-transition BE-A cắm; BE-B (Contract/BoardDecision) cắm tương tự. `actorId` null = hành động hệ thống.
- **AppConfigService** (`@Global`, PA-10): `get()` trả registry tham số nghiệp vụ (cache in-memory TTL 30s + lazy-seed +
  invalidate-on-PATCH). Wire BE-A: `nameMaxReviewRounds` (PA-05), `maxUploadBytes` (A7), `reputationRecommendThreshold`
  (A-AUTH-07); 4 key còn lại seed sẵn chờ BE-B. Env/constant cũ = **seed default**, KHÔNG còn đọc runtime.

## 9. State Machine & Single-writer

- Mỗi state machine (Series, Manuscript, Page, ...) chỉ được ghi bởi **một state service duy nhất**
  (`<entity>-state.service.ts`). Service đó: validate transition theo bảng `*_TRANSITIONS` (sai → 409),
  push audit vào `statusHistory[]` (embedded), đồng bộ các status dẫn xuất (vd `Chapter.status` từ Manuscript).
- Cross-module dependency chưa sẵn sàng (BE-B) → khai **port interface** + marker `// B1/B3/B5-INTEGRATION`,
  KHÔNG stub giả.

## 10. Gotchas (đọc kỹ — build/test tĩnh KHÔNG bắt được)

- **🔴 Response date field — 2 pattern, đừng trộn:** module **có mapper** (BE-A) khai `z.string()` + mapper
  `.toISOString()`. Module **parse thẳng Prisma entity** (BE-B) dùng **`zDateField()`**
  (`core/http/docs/date-docs.ts`). ⚠ `zDateField` PHẢI là `z.preprocess` — KHÔNG dùng
  `z.union([z.date(), z.string()]).transform(...)`: `z.toJSONSchema` sẽ ném *"Transforms cannot be represented
  in JSON Schema"* → **vỡ boot Swagger**. Đổi `z.any()` → `z.string()` mà KHÔNG convert cũng sai (Date không phải
  string → ZodSerializationException → **500**, đúng lớp bug BE-004).
- **🔴 ListNamesQuery / Empty strict query: `nestjs-zod` vỡ boot nếu `@Query()` schema là `z.object({}).strict()`** —
  `cleanupOpenApiDoc` yêu cầu "Query or url parameters must be an object type" (non-empty). Workaround:
  thêm **một field optional** vào schema (vd `page: z.coerce.number().int().min(1).optional()`) và giữ `.strict()`.
  Đây là cách `name.controller.list()` enforce `?kind=CHAPTER → 422` (tách vai Spec 12 Part C).
- **DTO date field (schema đi vào `@ZodResponse` hoặc request body) → `z.string()` ISO**, KHÔNG
  `z.date()`/`z.coerce.date()` (vỡ Swagger zod v4 lúc boot). Convert Date → ISO ở mapper.
  ⚠ **Ngoại lệ hợp lệ:** schema **entity nội bộ** — chỉ dùng để `z.infer` ra data-type khớp Prisma,
  KHÔNG serialize ra HTTP (mọi field date đều bị `.omit()` khỏi Body, Res schema khai riêng) — **ĐƯỢC**
  dùng `z.coerce.date()` vì Prisma trả `Date`. Ví dụ: `board/schemas/board.model.ts`. **ĐỪNG "sửa"
  chúng thành `z.string()`** — sẽ sai type toàn bộ repo/service.
- **🔴 Prisma optional-composite (Mongo):** field composite optional (vd `Series.proposal SeriesProposal?`)
  khi `.update()` chỉ có `set`/`upsert`/`unset` — KHÔNG có partial update. Bare `proposal: { x }` = `set`
  = **full replace → data loss**. Fix = read-modify-write `proposal: { set: { ...current, changed } }`.
  (Scalar field + `array: { push }` thì an toàn.)
- **R2 presigned (storage):** S3Client phải `requestChecksumCalculation:'WHEN_REQUIRED'` +
  `responseChecksumValidation:'WHEN_REQUIRED'` (tắt CRC32 mặc định SDK v3); pin content-type vào chữ ký
  bằng `getSignedUrl(..., { signableHeaders: new Set(['content-type']) })`.
- Cascade chạm nhiều collection (Task→Page→Manuscript) phải bọc MongoDB transaction; side-effect ngoài DB
  (event/notify) đẩy ra SAU commit.
- **🔴 Optional field `null` vs ABSENT (Mongo) — VERIFIED:** field optional (vd `User.deletedAt`) khi tạo không set
  thì Mongo lưu **absent** (Prisma vẫn hydrate object ra `null`). `where: { deletedAt: null }` **KHÔNG match** doc absent
  → query trả rỗng. Lọc "chưa bị xoá mềm" phải dùng `{ deletedAt: { isSet: false } }`, KHÔNG `{ deletedAt: null }`.
  (Unit test mock repo KHÔNG bắt được — chỉ lộ ở smoke DB thật.)
- **🔴 Redis 2-client tách (BullMQ vs general):** BullMQ connection **bắt buộc** `maxRetriesPerRequest: null`. KHÔNG
  dùng chung connection đó cho RateLimitService/cron-lock — khi Redis chết, lệnh sẽ retry vô hạn (treo) thay vì lỗi
  nhanh → cơ chế **fail-open** không kích hoạt. Client general phải `maxRetriesPerRequest: 1` + `enableOfflineQueue: false`.
- **Rate-limit fail-open:** RateLimitService catch lỗi Redis → **cho qua** (return allowed) + log; tuyệt đối không để
  Redis blip khóa luồng auth. (Smoke: kill Redis → request vẫn qua.)
- **BullMQ worker graceful shutdown:** `main.ts` phải `app.enableShutdownHooks()` để worker drain job đang chạy trước
  khi tắt. Emit/enqueue side-effect chạy SAU khi DB write commit (giống event/notify).
- **Redis là hạ tầng BẮT BUỘC lúc boot:** `RedisService.onModuleInit` PING fail-fast → thiếu Redis = app exit. Prod
  phải inject `REDIS_URL` reachable. (Unit test mock client — KHÔNG nối Redis thật.)
- **🔴 ZodSerializer strip field ngoài DTO (mất response `message`):** `ResponseEnvelopeInterceptor` đăng ký TRƯỚC
  `ZodSerializerInterceptor` ⇒ trên response path Zod serialize theo `@ZodResponse(DTO)` **trước** (strip mọi field
  không khai trong DTO), **rồi** envelope mới đọc field `message`. Muốn trả message tuỳ biến (vd xoá thành công
  `{ message: 'Proposal deleted' }`) thì DTO **phải chứa** field `message` → dùng **`MessageResDto`** (`core/http/dto/response.dto.ts`).
  Nếu DTO chỉ `{ id }` → `message` bị strip → envelope rơi về `message:'Success'`. (build/test tĩnh KHÔNG bắt được.)
- **Partial-update (PATCH semantics):** field optional cho cập nhật từng phần → schema dùng `.nullish()` (nhận cả
  omit lẫn `null`); repo chỉ ghi khi `!= null` (scalar: `if (body.x != null) data.x = body.x`; composite: `x: body.x ?? current.x`).
  Quy ước: omit/`null` = giữ nguyên; gửi `[]` cho mảng = clear. Áp đồng nhất để FE đoán được hành vi.
- **🔴 OBJECT_ID_RE guard cho route `:id` (BẮT BUỘC khi nhận id từ param/body để query field `@db.ObjectId`):**
  id rác (không 24-hex) đưa thẳng vào Prisma `where: { id }` → ném **P2023** → **500** (không phải 404 sạch).
  Trước khi query, guard: `const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/` → `if (!OBJECT_ID_RE.test(id)) throw <Entity>NotFoundException`.
  Pattern dùng ở `series-query`/`series-claim`/`series-proposal`/`admin-user-query`/`mangaka-profile` service — bám theo.
  (Unit test malformed-id bắt được; nhưng dễ quên khi thêm route `:id` mới → luôn thêm guard + 1 test id rác → 404.)

## 11. Migration / Done Checklist

Mỗi refactor/feature phải giữ:
- [ ] `pnpm build` exit 0
- [ ] `pnpm test` xanh (TDD: test trước, đỏ → xanh)
- [ ] `pnpm lint` 0 error
- [ ] `pnpm start:dev` boot không lỗi (Swagger build được)
- [ ] Smoke DB thật (Atlas) cho flow mới — không chỉ unit test mock
- [ ] Grep: 0 `console.log`/`TODO`/`FIXME` trong production code
- [ ] **API mới/đụng**: field enum dùng `zEnum`/`zRole`, field khó hiểu có `.describe()`, route có `@ApiOperation` + `@ApiErrors(...exceptions)` cho lỗi nghiệp vụ (xem §12)
- [ ] Git: mỗi commit = 1 logical change, green build (KHÔNG auto-commit — user tự commit)

## 12. API Documentation (Swagger) — convention bắt buộc

> Swagger sinh từ Zod schema (`createZodDto` + nestjs-zod v5 dùng `z.toJSONSchema` cho zod4). Tài liệu hoá là **metadata thuần** — KHÔNG đổi logic. Mỗi route/field thêm doc khi tạo, không để trống.

- **Enum field (BẮT BUỘC):** field enum (status, role/type, ...) ở **CẢ body/query/response** dùng
  `zEnum(PrismaEnum, 'Key')` / `zRole()` / `zRoleSubset([...])` từ `src/core/http/docs/enum-docs.ts`, **KHÔNG**
  `z.string()`. Mô tả enum sống tập trung ở `ENUM_DOCS`; date field response vẫn `z.string()` ISO (xem §10).
- `core/http/docs/date-docs.ts` — `zDateField()` helper (Spec 12 Part D).
- **Mô tả field:** field id/object-key/audit/nullable-có-ngữ-nghĩa → `.describe('...')` ngay trên zod field
  (vd `editorId: z.string().nullable().describe('null = ở hàng đợi review')`). Field hiển nhiên (title) thì bỏ qua.
- **Operation:** mỗi route mutating có `@ApiOperation({ summary })` (1 câu mô tả hành vi + transition).
- **Error response (BẮT BUỘC):** dùng `@ApiErrors(...exceptions)` từ
  `src/core/http/decorators/api-errors.decorator.ts`, truyền exception const-instance trong `errors/<name>.errors.ts`.
  Decorator tự derive status + `Error.*` code + gộp cùng status + append hint từ `ERROR_HINTS`
  (`src/core/http/docs/error-docs.ts`). KHÔNG gõ tay `@ApiResponse({ status, description: 'Error.X' })`; chỉ giữ
  `@ApiResponse(422, 'Validation...')` thuần cho validation-only. Thêm error mới → thêm hint vào `ERROR_HINTS`.
- **BE-B:** adopt cùng cơ chế (bổ sung enum của BE-B vào `ENUM_DOCS`, code vào `ERROR_HINTS`).
- **Envelope:** note 1 lần ở `main.ts` `DocumentBuilder.setDescription` (mọi success bọc `{success,message,data}` → FE đọc `data`;
  lỗi `{success:false,statusCode,message}`). **KHÔNG** lặp lại ở từng route. DTO mô tả shape **CHƯA bọc** (chính là `data`).
- **message tuỳ biến** phải nằm trong DTO mới sống qua serializer (xem §10 gotcha) — vd `MessageResDto` cho route trả message.

**Chi tiết convention → xem spec**: `docs/superpowers/specs/2026-06-28-api-docs-shared-convention-design.md`

