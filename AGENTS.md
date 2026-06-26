# AGENTS.md — Backend Development Guide

> Đọc file này TRƯỚC khi viết/sửa code. Mọi PR phải tuân thủ.

## 1. Project Overview

- **Kiến trúc tổng thể, data flow, tech stack chi tiết** → xem `ARCHITECTURE.md` (đọc trước khi code).
- **Stack**: NestJS 11, Prisma 6 (MongoDB replica set `rs0`), Zod 4 + nestjs-zod, JWT HS256, bcrypt,
  `@nestjs/event-emitter` (domain events), AWS SDK v3 → Cloudflare R2 (object storage), Resend (email), pnpm.
- **Feature modules hiện có**: `auth`, `users`, `notification`, `reviews`, `series`, `chapter`,
  `annotation`, `storage`. (Đây là phần **BE-A** — Creation & Production; BE-B sẽ thêm module thương mại/quản trị.)
- **Quy tắc vàng**: Vertical slice (NestJS chuẩn). Mỗi module tự chứa đủ: controller(s), service(s), repo,
  schemas, dto, errors, (mapper/constant/ports nếu cần).

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
|   |   |-- filters/                # CatchEverythingFilter (bộ lọc lỗi DUY NHẤT)
|   |   |-- interceptors/           # ResponseEnvelopeInterceptor ({success,message,data})
|   |   |-- pipes/                  # CustomZodValidationPipe (422)
|   |   `-- *.dto.ts                # MessageResDto, empty-body, ...
|   |-- security/                   # guards, decorators, role/auth-type constants
|   `-- models/                     # shared entity schemas (user.model.ts, ...)
|-- infrastructure/                 # external adapters / technology details
|   |-- database/                   # PrismaService + prisma-error.helper
|   |-- crypto/                     # HashingService (bcrypt)
|   |-- token/                      # TokenService + JWT payload types
|   |-- email/                      # EmailService (Resend) + React-email templates
|   `-- storage/                    # StorageService (R2 presigned URL)
└── modules/
    └── <name>/
        ├── <name>.module.ts
        ├── <name>.controller.ts     # có thể >1 controller / module (vd series + name)
        ├── <name>.service.ts        # Orchestrator (delegate tới use-case services)
        ├── <name>.repo.ts           # Module-level repository
        ├── <name>.mapper.ts         # (nếu cần) Prisma entity → response DTO (Date → ISO string)
        ├── <name>.constant.ts       # (nếu cần) enum/const cấp module
        ├── ports/                   # (nếu cần) interface tích hợp cross-module (defer BE-B)
        ├── schemas/
        │   ├── <name>.model.ts      # Entity schemas
        │   └── <name>-schemas.ts    # Request/response schemas
        ├── dto/<name>.dto.ts
        ├── errors/<name>.errors.ts
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

### Lỗi
- Exception dùng **const instance** pattern:
  ```typescript
  export const InvalidOTPException = new UnprocessableEntityException([
    { message: 'Error.InvalidOTP', path: 'code' }
  ])
  ```
- App-level constants ở concern folder tương ứng (vd `src/core/security/role.constant.ts`);
  domain constants ở `src/modules/<domain>/` — KHÔNG hard-code messages.
- Error code format: `<MODULE>_<REASON>` (e.g. `AUTH_OTP_INVALID`).
- **Validation fail = 422** (CustomZodValidationPipe), KHÔNG phải 400.
- **`CatchEverythingFilter` là bộ lọc lỗi DUY NHẤT** (safety net). Mọi lỗi chuẩn hóa về:
  ```json
  { "success": false, "statusCode": <n>, "message": <string | zod-issues[]> }
  ```
  (Prisma P2002 → 409; lỗi không xác định → 500. KHÔNG bọc object lồng object.)

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

## 9. State Machine & Single-writer

- Mỗi state machine (Series, Manuscript, Page, ...) chỉ được ghi bởi **một state service duy nhất**
  (`<entity>-state.service.ts`). Service đó: validate transition theo bảng `*_TRANSITIONS` (sai → 409),
  push audit vào `statusHistory[]` (embedded), đồng bộ các status dẫn xuất (vd `Chapter.status` từ Manuscript).
- Cross-module dependency chưa sẵn sàng (BE-B) → khai **port interface** + marker `// B1/B3/B5-INTEGRATION`,
  KHÔNG stub giả.

## 10. Gotchas (đọc kỹ — build/test tĩnh KHÔNG bắt được)

- **DTO date field → `z.string()` ISO**, KHÔNG `z.date()`/`z.coerce.date()` (vỡ Swagger zod v4 lúc boot).
  Convert Date → ISO ở mapper.
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

## 11. Migration / Done Checklist

Mỗi refactor/feature phải giữ:
- [ ] `pnpm build` exit 0
- [ ] `pnpm test` xanh (TDD: test trước, đỏ → xanh)
- [ ] `pnpm lint` 0 error
- [ ] `pnpm start:dev` boot không lỗi (Swagger build được)
- [ ] Smoke DB thật (Atlas) cho flow mới — không chỉ unit test mock
- [ ] Grep: 0 `console.log`/`TODO`/`FIXME` trong production code
- [ ] Git: mỗi commit = 1 logical change, green build (KHÔNG auto-commit — user tự commit)

**Chi tiết convention → xem spec**: `docs/superpowers/specs/2026-06-14-shared-refactor-design.md`
