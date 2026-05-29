# 🤖 AGENT.md — Hướng dẫn cho AI Models

> **Đọc file này ĐẦU TIÊN** trước khi implement, review, hoặc debug bất kỳ thứ gì trong codebase.
> File này cung cấp context nhanh để bất kỳ AI model nào có thể làm việc hiệu quả với dự án Mangaka Backend.

---

## Dự án này là gì?

**Mangaka** — Backend API cho một nền tảng liên quan đến manga/comic. Được xây dựng bằng **NestJS 11 + TypeScript + Prisma + MongoDB**. Dự án đang ở giai đoạn setup foundation — các tính năng nghiệp vụ (authentication, CRUD manga, user management...) sẽ được build trên nền tảng này.

---

## ⚡ Quick Reference

| Câu hỏi | Trả lời |
|---------|---------|
| Framework? | NestJS 11 (TypeScript) |
| Database? | MongoDB 7 (qua Prisma ORM) + Redis 7 |
| Validation? | **Zod** (qua `nestjs-zod`) — KHÔNG dùng `class-validator` |
| Auth? | JWT HS256 (access + refresh token) |
| Package manager? | **pnpm** (KHÔNG npm/yarn) |
| Module system? | `NodeNext` — imports CẦN file extension cho relative imports |
| Code style? | No semicolons, single quotes, 120 char width |
| Test framework? | Jest |
| API docs? | Swagger tại `/api` |

---

## 📁 Cấu trúc project — Biết file nào ở đâu

```
src/
├── main.ts                              # Bootstrap app + Swagger setup
├── app.module.ts                        # Root module (global pipes/filters/interceptors)
├── app.controller.ts                    # GET / health check
├── app.service.ts                       # Placeholder service
└── shared/                              # ⭐ Core infrastructure — @Global module
    ├── shared.module.ts                 # Export: PrismaService, HashingService, TokenService
    ├── config/envConfig.ts              # ✅ Zod-validated env variables (fail-fast)
    ├── filters/
    │   ├── http-exception.filter.ts     # Log ZodSerializationException
    │   └── catch-everything.filter.ts   # Safety net — P2002 → 409, rest → 500
    ├── pipes/
    │   └── custom-zod-validation.pipe.ts # Validation error → 422 (NOT 400)
    ├── services/
    │   ├── prisma.service.ts            # PrismaClient singleton
    │   ├── hashing.service.ts           # bcrypt hash/compare
    │   └── token.service.ts             # JWT sign/verify
    ├── helper/
    │   ├── helper.prisma.ts             # isUniqueConstrainError, isNotFoundError
    │   └── helperOtp.ts                 # generateOTP (6 digits)
    └── types/
        └── jwt.type.ts                  # JwtPayload { userId, exp, iat }
```

---

## 🚨 Quy tắc BẮT BUỘC — Phải tuân thủ khi viết code

### 1. Validation — Chỉ dùng Zod

```typescript
// ✅ ĐÚNG — dùng Zod + nestjs-zod
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
})
export class CreateUserDto extends createZodDto(CreateUserSchema) {}

// ❌ SAI — KHÔNG dùng class-validator / class-transformer
import { IsEmail, IsString } from 'class-validator'  // ← KHÔNG DÙNG
```

### 2. Module pattern — SharedModule là @Global

```typescript
// SharedModule đã @Global(), KHÔNG cần import lại
// ✅ Chỉ cần inject qua constructor
@Injectable()
export class MyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashing: HashingService,
    private readonly token: TokenService,
  ) {}
}
```

### 3. Error handling — Sử dụng convention sẵn có

```typescript
// Validation errors → 422 (tự động qua CustomZodValidationPipe)
// Unique constraint → 409 (tự động qua CatchEverythingFilter)
// Not found → dùng helper
import { isNotFoundError } from 'src/shared/helper/helper.prisma'

try {
  await this.prisma.user.update({ ... })
} catch (error) {
  if (isNotFoundError(error)) {
    throw new NotFoundException('User not found')
  }
  throw error  // CatchEverythingFilter sẽ xử lý
}
```

### 4. Env config — Import từ envConfig

```typescript
// ✅ ĐÚNG — import envConfig
import envConfig from 'src/shared/config/envConfig'
const port = envConfig.PORT

// ❌ SAI — KHÔNG dùng process.env trực tiếp
const port = process.env.PORT  // ← KHÔNG LÀM THẾ NÀY
```

### 5. Code style

```typescript
// ✅ No semicolons
// ✅ Single quotes
// ✅ Trailing commas
// ✅ 120 char max width
const result = await this.prisma.user.findUnique({
  where: { id: userId },
})
```

### 6. Path aliases

```typescript
// ✅ Dùng absolute import với alias `src/`
import { PrismaService } from 'src/shared/services/prisma.service'

// ❌ Tránh relative imports quá sâu
import { PrismaService } from '../../../shared/services/prisma.service'
```

---

## 🏗️ Khi tạo module/feature MỚI — Checklist

### Bước 1: Tạo cấu trúc file

```
src/
└── shared/                          # Infrastructure (đã có)
└── <feature-name>/                  # ← Tạo thư mục mới tại src/
    ├── <feature-name>.module.ts     # Module definition
    ├── <feature-name>.controller.ts # HTTP endpoints
    ├── <feature-name>.service.ts    # Business logic
    ├── <feature-name>.dto.ts        # Zod schemas + DTOs
    └── <feature-name>.spec.ts       # Unit tests (optional)
```

### Bước 2: Định nghĩa DTO bằng Zod

```typescript
// user.dto.ts
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// Request schema
export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8),
})
export class CreateUserDto extends createZodDto(CreateUserSchema) {}

// Response schema (cho ZodSerializerInterceptor)
export const UserResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
})
export class UserResponseDto extends createZodDto(UserResponseSchema) {}
```

### Bước 3: Tạo Service

```typescript
// user.service.ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/shared/services/prisma.service'
import { HashingService } from 'src/shared/services/hashing.service'
import { CreateUserDto } from './user.dto'

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashing: HashingService,
  ) {}

  async create(dto: CreateUserDto) {
    const hashedPassword = await this.hashing.hash(dto.password)
    return this.prisma.user.create({
      data: {
        ...dto,
        password: hashedPassword,
      },
    })
  }
}
```

### Bước 4: Tạo Controller

```typescript
// user.controller.ts
import { Controller, Post, Body } from '@nestjs/common'
import { UserService } from './user.service'
import { CreateUserDto, UserResponseDto } from './user.dto'
import { ZodSerializerDto } from 'nestjs-zod'

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @ZodSerializerDto(UserResponseDto)  // ← Serialize response qua Zod schema
  async create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto)
  }
}
```

### Bước 5: Tạo Module + Import vào AppModule

```typescript
// user.module.ts
import { Module } from '@nestjs/common'
import { UserController } from './user.controller'
import { UserService } from './user.service'

@Module({
  controllers: [UserController],
  providers: [UserService],
  // KHÔNG cần import SharedModule — nó đã @Global()
})
export class UserModule {}
```

```typescript
// app.module.ts — thêm import
@Module({
  imports: [SharedModule, UserModule],  // ← Thêm module mới vào đây
  // ...
})
export class AppModule {}
```

---

## 🗄️ Database — Prisma + MongoDB

### Khi thêm model mới vào schema

1. Sửa `prisma/schema.prisma`
2. Chạy: `pnpm prisma generate` → tạo lại Prisma Client
3. Chạy: `pnpm prisma db push` → áp dụng schema lên MongoDB

### Convention cho MongoDB models

```prisma
model NewModel {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  // ↑ Luôn dùng pattern này cho ID

  // Relations dùng @db.ObjectId
  userId    String   @db.ObjectId
  user      User     @relation(fields: [userId], references: [id])

  // Timestamps (thêm nếu cần)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Lưu ý quan trọng về MongoDB + Prisma

- MongoDB **bắt buộc** replica set — local dev dùng `rs0`
- ID là `String` (ObjectId), KHÔNG phải `Int`
- Không hỗ trợ `autoincrement()` — dùng `@default(auto())` với `@db.ObjectId`
- `@unique` tạo unique index trên MongoDB

---

## 🔑 Authentication Flow

### Token Service API

```typescript
// Sign tokens
const accessToken = await tokenService.signAccessToken({ userId: 123 })
const refreshToken = tokenService.signRefreshToken({ userId: 123 })

// Verify tokens
const payload: JwtPayload = await tokenService.verifyAccessToken(token)
// payload = { userId: 123, exp: ..., iat: ... }
```

### Password Hashing

```typescript
const hash = await hashingService.hash('plain_password')
const isMatch = await hashingService.compare('plain_password', hash)
```

---

## 🐛 Error Response Format

### Validation Error (422)

```json
{
  "statusCode": 422,
  "message": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": "email",
      "message": "Required"
    }
  ]
}
```

### Unique Constraint Error (409)

```json
{
  "statusCode": 409,
  "message": "Record already exists"
}
```

### Generic Error (500)

```json
{
  "statusCode": 500,
  "message": "Internal server error"
}
```

---

## 🐳 Docker — Cách chạy

### FE devs (docker-compose all-in-one)

```bash
cp .env.example .env  # điền giá trị
docker compose up --build
```
> Khởi động MongoDB, Redis, và NestJS chung trong 1 container.

### BE devs (chạy trực tiếp)

```bash
pnpm install
pnpm prisma generate
pnpm prisma db push
pnpm start:dev
```

### Swagger UI

```
http://localhost:{PORT}/api
```

---

## 📋 Env Variables cần biết

| Variable | Type | Mô tả |
|----------|------|--------|
| `PORT` | number | Server port (default: 4000) |
| `SALT_OR_ROUNDS` | number | bcrypt complexity |
| `DATABASE_URL` | string | MongoDB URI (cần replica set) |
| `REDIS_URL` | string | Redis connection string |
| `ACCESS_TOKEN_SECRET` | string | JWT access secret |
| `REFRESH_TOKEN_SECRET` | string | JWT refresh secret |
| `ACCESS_TOKEN_EXPIRES_IN` | string | Access token TTL (vd: `1h`) |
| `REFRESH_TOKEN_EXPIRES_IN` | string | Refresh token TTL (vd: `7d`) |
| `API_KEY` | string | API key nội bộ |
| `AUTH_TYPE_KEY` | string | Auth type header key |
| `ADMIN_*` | string | Seed admin data |
| `OTP_EXPIRES_IN` | string | OTP TTL (vd: `5m`) |

---

## ⚠️ Known Issues & Gotchas

### 1. JwtPayload.userId là `number` nhưng MongoDB dùng ObjectId (`string`)
- Trong `jwt.type.ts`, `userId` được khai báo `number`
- Nhưng Prisma schema dùng `String @db.ObjectId` cho ID
- **Khi implement auth**: cần sửa `JwtPayload.userId` thành `string`

### 2. Swagger chưa customize
- `main.ts` vẫn dùng placeholder title "Cats example"
- Cần cập nhật title, description, version cho Mangaka

### 3. Double global pipe registration
- `main.ts` dùng `app.useGlobalPipes(new ZodValidationPipe())`
- `app.module.ts` cũng đăng ký `CustomZodValidationPipe` qua `APP_PIPE`
- Cả 2 đều chạy → có thể gây validate 2 lần
- **Khuyến nghị**: bỏ dòng `app.useGlobalPipes()` trong `main.ts`

### 4. Prisma schema là placeholder
- Models `User` và `Post` hiện tại là mẫu demo
- Cần thiết kế lại schema cho domain thực tế (Mangaka)

### 5. `signAccessToken` là async nhưng `signRefreshToken` là sync
- `signAccessToken` dùng `signAsync()` 
- `signRefreshToken` dùng `sign()` (sync)
- Nên thống nhất cả 2 dùng async

---

## 🔍 Review Checklist — Khi review code

- [ ] DTO dùng Zod (KHÔNG class-validator)?
- [ ] Import dùng path alias `src/`?
- [ ] KHÔNG dùng `process.env` trực tiếp?
- [ ] Prisma errors được xử lý bằng helpers?
- [ ] New module được import vào `AppModule`?
- [ ] Code không có semicolons, dùng single quotes?
- [ ] Response DTO có `@ZodSerializerDto()` decorator?
- [ ] Prisma model ID dùng pattern `@id @default(auto()) @map("_id") @db.ObjectId`?
- [ ] Nếu thêm env var mới → cập nhật `envConfig.ts` schema + `.env.example`?

---

## 📚 Tham khảo thêm

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Chi tiết kiến trúc, diagrams, data flow
- [README.md](./README.md) — Hướng dẫn setup, chạy project
- [NestJS Docs](https://docs.nestjs.com)
- [Prisma MongoDB Docs](https://www.prisma.io/docs/concepts/database-connectors/mongodb)
- [nestjs-zod](https://github.com/risen228/nestjs-zod)
