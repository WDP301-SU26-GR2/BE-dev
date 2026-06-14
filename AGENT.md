# AGENT.md â€” Backend Development Guide

> Äá»c file nÃ y TRÆ¯á»šC khi viáº¿t/sá»­a code. Má»i PR pháº£i tuÃ¢n thá»§.

## 1. Project Overview

- **Stack**: NestJS 11, Prisma, Zod, MongoDB (replica set `rs0`), TypeScript.
- **Module hiá»‡n táº¡i**: `auth`. (`users` Ä‘ang Ä‘Æ°á»£c tÃ¡i cáº¥u trÃºc â€” xem `src/modules/`.)
- **Quy táº¯c vÃ ng**: Vertical slice (NestJS chuáº©n). Má»—i module tá»± chá»©a Ä‘á»§: controller, service(s), repo, schemas, dto, errors.

## 2. Folder Structure

```
src/
â”œâ”€â”€ main.ts
â”œâ”€â”€ app.module.ts
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
â””â”€â”€ modules/
    â””â”€â”€ <name>/
        â”œâ”€â”€ <name>.module.ts
        â”œâ”€â”€ <name>.controller.ts
        â”œâ”€â”€ <name>.service.ts        # Orchestrator (delegate tá»›i use-case services)
        â”œâ”€â”€ <name>.repo.ts           # Module-level repository
        â”œâ”€â”€ schemas/
        â”‚   â”œâ”€â”€ <name>.model.ts      # Entity schemas
        â”‚   â””â”€â”€ <name>-schemas.ts   # Request/response schemas
        â”œâ”€â”€ dto/<name>.dto.ts
        â”œâ”€â”€ errors/<name>.errors.ts
        â””â”€â”€ services/                # Optional: use-case services
            â”œâ”€â”€ <name>-<usecase>.service.ts
            â””â”€â”€ ...
```

## 3. Layer Responsibilities

| Layer | Responsibility | KHÃ”NG lÃ m |
|-------|---------------|-----------|
| **Controller** | HTTP route, call service, return response | KhÃ´ng validate, khÃ´ng gá»i repo trá»±c tiáº¿p |
| **Service** | Business logic, orchestration, validate business rules | KhÃ´ng Prisma detail, khÃ´ng `req`/`res` |
| **Repository** | Data access (Prisma) | KhÃ´ng business logic |
| **Schema (Zod)** | Validation + type inference | KhÃ´ng throw HttpException |
| **DTO** | Swagger + controller return type | KhÃ´ng cÃ³ logic |

## 4. Naming Conventions

| Loáº¡i | Convention | VÃ­ dá»¥ |
|------|-----------|-------|
| File | `kebab-case.ts` | `auth-registration.service.ts` |
| Class | `PascalCase` | `AuthRegistrationService` |
| Variable/function | `camelCase` | `getUserById` |
| Constant | `SCREAMING_SNAKE_CASE` | `OTP_PURPOSE.REGISTER` |
| Type alias | `PascalCase` + `Type` | `RegisterBodyType` |
| Zod schema | `PascalCase` + `Schema` | `RegisterBodySchema` |
| DTO class | `PascalCase` + `Dto` | `RegisterBodyDto` |
| Exception | `PascalCase` + `Exception` (hoáº·c const instance) | `InvalidOTPException` |

## 5. Repository Placement Rule

| Loáº¡i | Vá»‹ trÃ­ | Khi nÃ o táº¡o |
|------|--------|-------------|
| **Module repository** | `src/modules/<name>/<name>.repo.ts` | Module Ä‘Ã³ Ä‘ang dÃ¹ng method |
| **Shared repository** | Không tạo trong `src/core/` hoặc `src/infrastructure/` | Nếu 2+ modules cần chung data access thì thiết kế lại module boundary trước |

## 6. Service Boundary

TÃ¡ch service theo use-case khi **báº¥t ká»³** Ä‘iá»u kiá»‡n nÃ o:
- Service > 200 dÃ²ng
- Service cÃ³ > 4 use-case methods
- Service cÃ³ > 6 dependencies inject
- CÃ³ nhÃ³m methods hoÃ n toÃ n Ä‘á»™c láº­p

**Pattern**: 1 Orchestrator + N UseCase Services.
- Controller inject **chá»‰** Orchestrator.
- Orchestrator delegate sang use-case services.

## 7. Error Handling

- Exception dÃ¹ng **const instance** pattern:
  ```typescript
  export const InvalidOTPException = new UnprocessableEntityException([
    { message: 'Error.InvalidOTP', path: 'code' }
  ])
  ```
- App-level constants ở concern folder tương ứng (vd `src/core/security/role.constant.ts`); domain constants ở `src/modules/<domain>/` — KHÔNG hard-code messages.
- Error code format: `<MODULE>_<REASON>` (e.g. `AUTH_OTP_INVALID`).

## 8. Migration Checklist

Má»—i refactor pháº£i giá»¯:
- [ ] `npm run build` exit 0
- [ ] `npm run start:dev` khÃ´ng lá»—i
- [ ] E2E auth flow pass (náº¿u touch auth module)
- [ ] Grep: 0 `console.log`/`TODO`/`FIXME` trong production code
- [ ] Git: má»—i commit = 1 logical change, green build

**Chi tiáº¿t convention â†’ xem spec**: `docs/superpowers/specs/2026-06-14-shared-refactor-design.md`
