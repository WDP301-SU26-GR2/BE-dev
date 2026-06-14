# ðŸ—ï¸ Kiáº¿n trÃºc há»‡ thá»‘ng â€” Mangaka Backend

> TÃ i liá»‡u mÃ´ táº£ kiáº¿n trÃºc tá»•ng thá»ƒ, data flow, vÃ  cÃ¡c design pattern Ä‘Æ°á»£c Ã¡p dá»¥ng trong dá»± Ã¡n.
> **Äá»c file nÃ y TRÆ¯á»šC khi báº¯t tay vÃ o code.**

---

## 1. Tech Stack Overview

| Layer | CÃ´ng nghá»‡ | Version | Ghi chÃº |
|-------|-----------|---------|---------|
| **Runtime** | Node.js | 22+ | LTS, cháº¡y trÃªn ES2022 target |
| **Framework** | NestJS | 11.x | Sá»­ dá»¥ng module pattern, Dependency Injection |
| **Language** | TypeScript | 5.7+ | Strict mode, `NodeNext` module system |
| **ORM** | Prisma | 6.19+ | Schema-first, type-safe database access |
| **Database** | MongoDB | 7.x | Replica set (`rs0`) báº¯t buá»™c cho Prisma |
| **Cache/Queue** | Redis | 7.x | Caching, session, vÃ  job queue |
| **Validation** | Zod + nestjs-zod | zod 4.x | Schema validation cho cáº£ request vÃ  response |
| **Auth** | JWT (HS256) | @nestjs/jwt 11.x | Access + Refresh token pair |
| **Hashing** | bcrypt | 6.x | Password hashing |
| **API Docs** | Swagger | @nestjs/swagger 11.x | Auto-generated táº¡i `/api` |
| **Package Manager** | pnpm | 10+ | Workspace-aware, lockfile `pnpm-lock.yaml` |
| **Container** | Docker | Multi-stage build | Production (`Dockerfile`) + Dev all-in-one (`Dockerfile.dev`) |
| **CI** | GitHub Actions | - | Build verification trÃªn `main` vÃ  `develop` |
| **Linting** | ESLint + Prettier | Flat config (`eslint.config.mjs`) | No semicolons, single quotes, 120 printWidth |

---

## 2. Cáº¥u trÃºc thÆ° má»¥c

```
BE-dev/
â”œâ”€â”€ prisma/
â”‚   â””â”€â”€ schema.prisma              # Database schema (MongoDB)
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ main.ts                     # Bootstrap â€” khá»Ÿi táº¡o app, Swagger, listen port
â”‚   â”œâ”€â”€ app.module.ts               # Root module â€” import CoreModule + feature modules, Ä‘Äƒng kÃ½ global pipes/filters/interceptor
â”‚   â”œâ”€â”€ initialScript/              # Seed script (admin, roles) â€” cháº¡y báº±ng `pnpm seed`
â”‚   â”œâ”€â”€ modules/                    # â­ Feature modules (vertical slice)
â”‚   â”‚   â””â”€â”€ auth/                   # Module máº«u: controller + services/ + repo + schemas + dto + errors
│   ├── core/                       # App-level cross-cutting rules, @Global()
│   │   ├── core.module.ts          # Export infra services + register global guards
│   │   ├── config/
│   │   │   └── envConfig.ts
│   │   ├── http/                   # filters, pipes, shared HTTP DTOs
│   │   ├── security/               # guards, decorators, auth type, role constants
│   │   └── models/
│   │       └── user.model.ts       # User schema + Prisma-sourced UserStatus
│   ├── infrastructure/             # External adapters / technology details
│   │   ├── database/               # PrismaService + Prisma error helpers
│   │   ├── crypto/
│   │   │   └── hashing.service.ts
│   │   ├── token/                  # TokenService + JWT payload types
│   │   └── email/                  # EmailService + React-email templates
â”œâ”€â”€ test/                           # E2E tests (Jest)
â”œâ”€â”€ .env                            # Env variables (KHÃ”NG commit lÃªn git)
â”œâ”€â”€ .env.example                    # Template env
â”œâ”€â”€ docker-compose.yml              # Dev one-click: MongoDB + NestJS (cho FE devs)
â”œâ”€â”€ Dockerfile                      # Production multi-stage build
â”œâ”€â”€ Dockerfile.dev                  # Dev image (Node + MongoDB cÃ¹ng container)
â”œâ”€â”€ docker-entrypoint.dev.sh        # Init script: MongoDB replica â†’ pnpm install â†’ prisma â†’ NestJS
â”œâ”€â”€ .github/workflows/ci.yml        # CI: build Docker image verification
â”œâ”€â”€ package.json                    # Dependencies + scripts
â”œâ”€â”€ pnpm-lock.yaml                  # Lockfile
â”œâ”€â”€ pnpm-workspace.yaml             # pnpm build allowlist (native modules)
â”œâ”€â”€ tsconfig.json                   # TS config â€” strict, NodeNext modules
â”œâ”€â”€ eslint.config.mjs               # ESLint flat config
â””â”€â”€ .prettierrc                     # Code formatting rules
```

---

## 3. Module Architecture

```mermaid
graph TD
    subgraph "Root"
        MAIN["main.ts<br/>Bootstrap"]
        APP_MOD["AppModule"]
    end

    subgraph "Global Providers (APP_*)"
        PIPE["CustomZodValidationPipe<br/>(APP_PIPE)"]
        INTERCEPTOR["ZodSerializerInterceptor<br/>(APP_INTERCEPTOR)"]
        FILTER_HTTP["HttpExceptionFilter<br/>(APP_FILTER)"]
        FILTER_ALL["CatchEverythingFilter<br/>(APP_FILTER)"]
    end

    subgraph "CoreModule (@Global)"
        PRISMA["PrismaService"]
        HASHING["HashingService"]
        TOKEN["TokenService"]
        EMAIL["EmailService"]
        JWT_MOD["JwtModule"]
        AUTH_GUARD["AuthenticationGuard<br/>(APP_GUARD)"]
        ROLES_GUARD["RolesGuard<br/>(APP_GUARD)"]
    end

    MAIN --> APP_MOD
    APP_MOD --> PIPE
    APP_MOD --> INTERCEPTOR
    APP_MOD --> FILTER_HTTP
    APP_MOD --> FILTER_ALL
    APP_MOD --> CoreModule
    CoreModule --> PRISMA
    CoreModule --> HASHING
    CoreModule --> TOKEN
    CoreModule --> EMAIL
    CoreModule --> JWT_MOD
    CoreModule --> AUTH_GUARD
    CoreModule --> ROLES_GUARD
```

### CoreModule lÃ  `@Global()`
- Táº¥t cáº£ services exported (PrismaService, HashingService, TokenService, EmailService) Ä‘á»u **tá»± Ä‘á»™ng available** á»Ÿ má»i module khÃ¡c mÃ  KHÃ”NG cáº§n import láº¡i.
- Khi táº¡o module má»›i, chá»‰ cáº§n inject service qua constructor lÃ  dÃ¹ng Ä‘Æ°á»£c.
- `CoreModule` registers `AuthenticationGuard` as the first global guard (`APP_GUARD`): routes require Bearer auth by default unless marked with `@IsPublic()`.
- `RolesGuard` is registered as the second global guard, after `AuthenticationGuard`, so it can read `request.user` and enforce `@Roles(...)`.
- Core/infrastructure-vs-module rule: `core/` contains app-level cross-cutting rules, `infrastructure/` contains external adapters, and domain logic belongs in `modules/<domain>/` (for example `OtpPurpose` and OTP generation live in `modules/auth/`).

### RBAC (Authorization)

- Routes without `@Roles()` behave as authenticated routes without role restriction.
- Routes with `@Roles(RoleName.ADMIN, ...)` require the access-token `roleName` to be in the allowed list; missing user or wrong role returns 403.
- The current authorization tier is role-based. Permission-based authorization can be added later when granular business rules require it.

---

## 4. Request Lifecycle & Error Handling

```mermaid
sequenceDiagram
    participant Client
    participant Pipe as CustomZodValidationPipe
    participant Controller
    participant Service
    participant Interceptor as ZodSerializerInterceptor
    participant FilterHTTP as HttpExceptionFilter
    participant FilterAll as CatchEverythingFilter

    Client->>Pipe: HTTP Request
    
    alt Validation fails
        Pipe-->>Client: 422 Unprocessable Entity<br/>(Zod issues array)
    else Validation passes
        Pipe->>Controller: Validated DTO
        Controller->>Service: Business logic
        Service->>Controller: Result
        Controller->>Interceptor: Response DTO
        
        alt Serialization fails
            Interceptor->>FilterHTTP: ZodSerializationException
            FilterHTTP-->>Client: Error response (logged)
        else Serialization OK
            Interceptor-->>Client: 200 Serialized response
        end
    end
    
    Note over FilterAll: Safety net â€” báº¯t Má»ŒI exception chÆ°a xá»­ lÃ½
    
    alt Prisma Unique Constraint (P2002)
        FilterAll-->>Client: 409 Conflict
    else Unknown Error
        FilterAll-->>Client: 500 Internal Server Error
    end
```

### Chi tiáº¿t Error Flow

| Thá»© tá»± Æ°u tiÃªn | Filter | Báº¯t gÃ¬ | Response |
|----------------|--------|--------|----------|
| 1 | `CustomZodValidationPipe` | Zod validation errors | **422** â€” máº£ng `{code, message, path}` |
| 2 | `HttpExceptionFilter` | Má»i `HttpException` | Log `ZodSerializationException`, rá»“i xá»­ lÃ½ máº·c Ä‘á»‹nh |
| 3 | `CatchEverythingFilter` | **Má»i thá»© cÃ²n láº¡i** | Prisma P2002 â†’ **409**, cÃ²n láº¡i â†’ **500** |

> âš ï¸ **Quan trá»ng**: Validation errors tráº£ vá» **422** (KHÃ”NG pháº£i 400). ÄÃ¢y lÃ  design decision cÃ³ chá»§ Ä‘Ã­ch Ä‘á»ƒ client phÃ¢n biá»‡t validation error vs bad request.

---

## 5. Env Configuration â€” Fail-Fast Strategy

File `envConfig.ts` sá»­ dá»¥ng Zod Ä‘á»ƒ validate toÃ n bá»™ biáº¿n mÃ´i trÆ°á»ng **ngay khi app khá»Ÿi Ä‘á»™ng**:

```typescript
// Náº¿u thiáº¿u hoáº·c sai kiá»ƒu báº¥t ká»³ env var nÃ o â†’ process.exit(1) ngay láº­p tá»©c
const configSchema = z.object({
  PORT: z.coerce.number(),
  SALT_OR_ROUNDS: z.coerce.number(),
  DATABASE_URL: z.string(),
  ACCESS_TOKEN_SECRET: z.string(),
  REFRESH_TOKEN_SECRET: z.string(),
  // ... táº¥t cáº£ cÃ¡c biáº¿n báº¯t buá»™c
})
```

### Danh sÃ¡ch env variables

| Variable | Type | MÃ´ táº£ |
|----------|------|--------|
| `PORT` | number | Port server listen |
| `SALT_OR_ROUNDS` | number | bcrypt salt rounds |
| `DATABASE_URL` | string | MongoDB connection string (cáº§n replica set) |
| `REDIS_URL` | string | Redis connection string |
| `ACCESS_TOKEN_SECRET` | string | Secret key cho access JWT |
| `REFRESH_TOKEN_SECRET` | string | Secret key cho refresh JWT |
| `ACCESS_TOKEN_EXPIRES_IN` | string | TTL access token (vd: `1h`) |
| `REFRESH_TOKEN_EXPIRES_IN` | string | TTL refresh token (vd: `7d`) |
| `API_KEY` | string | API key cho internal services |
| `AUTH_TYPE_KEY` | string | Header key chá»‰ Ä‘á»‹nh loáº¡i auth (default: `authType`) |
| `ADMIN_NAME` | string | Seed admin name |
| `ADMIN_PASSWORD` | string | Seed admin password |
| `ADMIN_EMAIL` | string | Seed admin email |
| `ADMIN_PHONE` | string | Seed admin phone |
| `OTP_EXPIRES_IN` | string | TTL mÃ£ OTP (vd: `5m`) |

> **LÆ°u Ã½**: Khi cháº¡y production (`NODE_ENV=production`), khÃ´ng cáº§n file `.env` váº­t lÃ½ â€” env vars Ä‘Æ°á»£c inject tá»« orchestrator.

---

## 6. Database Layer

### Prisma + MongoDB

- **Provider**: `mongodb`
- **Schema location**: `prisma/schema.prisma`
- **ID strategy**: `@default(auto()) @map("_id") @db.ObjectId` â€” sá»­ dá»¥ng ObjectId gá»‘c cá»§a MongoDB
- **Replica Set**: Báº¯t buá»™c (`rs0`) â€” Prisma yÃªu cáº§u transactions/change streams

### Models

Schema (`prisma/schema.prisma`) Ä‘Ã£ khai bÃ¡o trÆ°á»›c **toÃ n bá»™ domain Mangaka** (~35 models) dÃ¹ má»›i cÃ³ module `auth`. NhÃ³m theo bounded context:

| NhÃ³m | Models |
|------|--------|
| **Identity & Access** | `User`, `Role`, `RefreshToken`, `OtpRequest` |
| **Content & Production** | `Series`, `SeriesProposal`, `Name`, `NamePage`, `Chapter`, `Page`, `Region`, `Manuscript`, `Asset`, `TaskAsset` |
| **Tasks & Review** | `Task`, `TaskVersion`, `Annotation`, `Schedule`, `ScheduleExtension` |
| **Survey & Ranking** | `SurveyPeriod`, `SurveyData`, `SurveyEntry`, `ReaderVote`, `ReaderVoteSeries`, `RankingRecord` |
| **Board & Decisions** | `BoardDecision`, `Vote`, `SeriesReport`, `ReportAttachment` |
| **Finance** | `PaymentConfig`, `EarningRecord` |
| **Notification & Config** | `Notification`, `VotingConfig`, `BoardConfig` |

**Enum hiá»‡n cÃ³**: `UserStatus`, `OtpPurpose`. CÃ²n láº¡i nhiá»u trÆ°á»ng `status`/`result`/`reviewStatus` Ä‘ang Ä‘á»ƒ kiá»ƒu `String` tá»± do â€” nÃªn chuyá»ƒn dáº§n sang Prisma enum cho cÃ¡c state machine (Series/Task/Chapter/BoardDecision...) Ä‘á»ƒ type-safe.

```prisma
model User {
  id            String     @id @default(auto()) @map("_id") @db.ObjectId
  email         String     @unique
  name          String
  displayName   String?
  password      String
  phoneNumber   String
  avatar        String?
  roleId        String     @db.ObjectId
  status        UserStatus @default(INACTIVE)
  emailVerified Boolean    @default(false)
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
  deletedAt     DateTime?

  role          Role           @relation(fields: [roleId], references: [id])
  refreshTokens RefreshToken[]

  @@index([deletedAt])
}
```

### PrismaService Lifecycle

```
App Start â†’ onModuleInit() â†’ $connect()
App Stop  â†’ onModuleDestroy() â†’ $disconnect()
```

### Prisma Error Helpers

| Function | Prisma Code | Ã nghÄ©a |
|----------|-------------|---------|
| `isUniqueConstrainError()` | P2002 | Duplicate key / unique constraint violation |
| `isNotFoundError()` | P2025 | Record not found |

---

## 7. Authentication Architecture

### JWT Token Pair

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ TokenService                                     â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ signAccessToken(userId)  â†’ JWT (HS256, 1h TTL)  â”‚
â”‚ signRefreshToken(userId) â†’ JWT (HS256, 7d TTL)  â”‚
â”‚ verifyAccessToken(token) â†’ JwtPayload           â”‚
â”‚ verifyRefreshToken(token)â†’ JwtPayload           â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### JWT Payload Interfaces

Access token carries `roleName` for RBAC checks; refresh token carries only `userId`.

```typescript
interface JwtAccessTokenPayload {
  userId: string   // ID ngÆ°á»i dÃ¹ng (Mongo ObjectId dáº¡ng string)
  roleName: string // Role code â€” dÃ¹ng cho phÃ¢n quyá»n
  exp: number      // Expiration timestamp
  iat: number      // Issued at timestamp
}

interface JwtRefreshTokenPayload {
  userId: string
  exp: number
  iat: number
}
```

### HashingService

- `hash(value)` â€” bcrypt hash vá»›i salt rounds tá»« env
- `compare(value, hash)` â€” so sÃ¡nh plaintext vá»›i hash

---

## 8. Docker Architecture

### Production (Dockerfile)

```
Multi-stage build:
  Stage 1 (base)    â†’ Node 22-slim + openssl + corepack
  Stage 2 (build)   â†’ pnpm install â†’ prisma generate â†’ nest build
  Stage 3 (runtime) â†’ Copy dist + node_modules â†’ non-root user â†’ CMD node dist/main.js
```

### Development (docker-compose.yml + Dockerfile.dev)

```
Single container "all-in-one":
  1. Start MongoDB 7 (replica set rs0)
  2. Start Redis 7
  3. pnpm install
  4. prisma generate
  5. prisma db push
  6. nest start --watch (hot reload)
```

> Docker dev setup dÃ nh cho **FE devs** â€” khÃ´ng cáº§n cÃ i Node/pnpm/MongoDB trÃªn mÃ¡y.

---

## 9. CI/CD

### GitHub Actions (`ci.yml`)

- **Trigger**: Push lÃªn `main`/`develop` hoáº·c báº¥t ká»³ Pull Request
- **Job**: Build Docker image (production `Dockerfile`) â€” khÃ´ng push, chá»‰ verify build thÃ nh cÃ´ng
- **Cache**: GitHub Actions cache (`type=gha`) cho Docker layers

---

## 10. Code Style & Conventions

### Prettier Rules

| Rule | Value |
|------|-------|
| Quotes | Single (`'`) |
| Semicolons | **KhÃ´ng dÃ¹ng** |
| Trailing comma | All |
| Print width | 120 |
| Tab width | 2 (spaces) |
| Arrow parens | Always |

### ESLint Rules

- TypeScript-ESLint recommended (type-checked)
- `no-explicit-any`: **OFF** (cho phÃ©p dÃ¹ng `any`)
- `no-floating-promises`: **WARN**
- `no-unsafe-argument`: **WARN**
- `no-unsafe-assignment`: **WARN**

### TypeScript Config

- Module: `NodeNext` (ESM-style imports)
- Target: `ES2022`
- Strict mode: **ON**
- `noImplicitAny`: **OFF** (cho phÃ©p implicit any)
- Decorators: Experimental enabled
- Path alias: `src/*` â†’ `./src/*`

---

## 11. Dependency Graph

```mermaid
graph LR
    subgraph "External"
        MONGO[(MongoDB)]
        REDIS[(Redis)]
    end

    subgraph "NestJS App"
        ENV["envConfig<br/>(Zod validated)"]
        PRISMA_SVC["PrismaService"]
        HASH_SVC["HashingService"]
        TOKEN_SVC["TokenService"]
        JWT_MOD["@nestjs/jwt"]
        PIPE["CustomZodValidationPipe"]
        FILTER1["HttpExceptionFilter"]
        FILTER2["CatchEverythingFilter"]
    end

    ENV --> PRISMA_SVC
    ENV --> HASH_SVC
    ENV --> TOKEN_SVC
    JWT_MOD --> TOKEN_SVC
    PRISMA_SVC --> MONGO
    FILTER2 -.-> |isUniqueConstrainError| MONGO
    ENV -.-> REDIS
```

---

## 12. CÃ¡c Scripts quan trá»ng

| Script | Lá»‡nh | MÃ´ táº£ |
|--------|-------|--------|
| `prisma:generate` | `prisma generate` | Táº¡o láº¡i Prisma Client (cháº¡y sau khi sá»­a `schema.prisma`) |
| `start:dev` | `nest start --watch` | Dev mode vá»›i hot reload |
| `start:prod` | `node dist/main` | Production mode |
| `build` | `nest build` | Compile TypeScript â†’ `dist/` |
| `lint` | `eslint ... --fix` | Lint + auto-fix |
| `test` | `jest` | Unit tests |
| `test:e2e` | `jest --config ./test/jest-e2e.json` | End-to-end tests |
