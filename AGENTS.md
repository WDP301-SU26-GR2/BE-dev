# AGENTS.md — Backend Development Guide

> Đọc file này TRƯỚC khi viết/sửa code. Mọi PR phải tuân thủ.

## 1. Project Overview

- **Kiến trúc tổng thể, data flow, tech stack chi tiết** → xem `ARCHITECTURE.md` (đọc trước khi code).
- **Stack**: NestJS 11, Prisma, Zod, MongoDB (replica set `rs0`), TypeScript.
- **Module hiện tại**: `auth`. (`users` đang được tái cấu trúc — xem `src/modules/`.)
- **Quy tắc vàng**: Vertical slice (NestJS chuẩn). Mỗi module tự chứa đủ: controller, service(s), repo, schemas, dto, errors.

## 2. Folder Structure

```
src/
├── main.ts
├── app.module.ts
|-- core/                    # app-level cross-cutting rules
|   |-- config/              # envConfig
|   |-- http/                # filters, pipes, shared response/empty-body DTOs
|   |-- security/            # guards, decorators, auth type, role constants
|   `-- models/              # Shared entity schemas (user.model.ts, ...)
|-- infrastructure/          # external adapters / technology details
|   |-- database/            # PrismaService, Prisma error helpers
|   |-- crypto/              # HashingService
|   |-- token/               # TokenService, JWT payload types
|   `-- email/               # EmailService + React-email templates
└── modules/
    └── <name>/
        ├── <name>.module.ts
        ├── <name>.controller.ts
        ├── <name>.service.ts        # Orchestrator (delegate tới use-case services)
        ├── <name>.repo.ts           # Module-level repository
        ├── schemas/
        │   ├── <name>.model.ts      # Entity schemas
        │   └── <name>-schemas.ts   # Request/response schemas
        ├── dto/<name>.dto.ts
        ├── errors/<name>.errors.ts
        └── services/                # Optional: use-case services
            ├── <name>-<usecase>.service.ts
            └── ...
```

## 3. Layer Responsibilities

| Layer | Responsibility | KHÔNG làm |
|-------|---------------|-----------|
| **Controller** | HTTP route, call service, return response | Không validate, không gọi repo trực tiếp |
| **Service** | Business logic, orchestration, validate business rules | Không Prisma detail, không `req`/`res` |
| **Repository** | Data access (Prisma) | Không business logic |
| **Schema (Zod)** | Validation + type inference | Không throw HttpException |
| **DTO** | Swagger + controller return type | Không có logic |

## 4. Naming Conventions

| Loại | Convention | Ví dụ |
|------|-----------|-------|
| File | `kebab-case.ts` | `auth-registration.service.ts` |
| Class | `PascalCase` | `AuthRegistrationService` |
| Variable/function | `camelCase` | `getUserById` |
| Constant | `SCREAMING_SNAKE_CASE` | `OTP_PURPOSE.REGISTER` |
| Type alias | `PascalCase` + `Type` | `RegisterBodyType` |
| Zod schema | `PascalCase` + `Schema` | `RegisterBodySchema` |
| DTO class | `PascalCase` + `Dto` | `RegisterBodyDto` |
| Exception | `PascalCase` + `Exception` (hoặc const instance) | `InvalidOTPException` |

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

## 7. Error Handling

- Exception dùng **const instance** pattern:
  ```typescript
  export const InvalidOTPException = new UnprocessableEntityException([
    { message: 'Error.InvalidOTP', path: 'code' }
  ])
  ```
- App-level constants ở concern folder tương ứng (vd `src/core/security/role.constant.ts`); domain constants ở `src/modules/<domain>/` — KHÔNG hard-code messages.
- Error code format: `<MODULE>_<REASON>` (e.g. `AUTH_OTP_INVALID`).

## 8. Migration Checklist

Mỗi refactor phải giữ:
- [ ] `npm run build` exit 0
- [ ] `npm run start:dev` không lỗi
- [ ] E2E auth flow pass (nếu touch auth module)
- [ ] Grep: 0 `console.log`/`TODO`/`FIXME` trong production code
- [ ] Git: mỗi commit = 1 logical change, green build

**Chi tiết convention → xem spec**: `docs/superpowers/specs/2026-06-14-shared-refactor-design.md`
