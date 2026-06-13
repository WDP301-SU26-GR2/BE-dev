# Design: Auth APIs — Login, Logout, Refresh Token, Forgot Password

**Date**: 2026-06-13
**Status**: Approved

## Context

`AuthModule` hiện đã có `register` và `send-otp-email`. Các schema/DTO/error cho
login, logout, refresh-token, forgot-password đã được định nghĩa sẵn trong
`auth.model.ts`, `auth.dto.ts`, `auth.errors.ts` nhưng chưa có service logic +
controller endpoint. `prisma/schema.prisma` đã có model `RefreshToken` đầy đủ
field cần dùng (`token`, `userId`, `expiresAt`, `createdAt`) → không cần migrate.

AGENT.md ghi nhận known issue: `JwtPayload.userId` đang là `number` nhưng
MongoDB dùng ObjectId (`string`) — cần sửa khi implement auth.

## Decisions

1. **JWT access token payload** chứa `userId` (string), `roleId` (string),
   `roleName` (string — role code). Xoá field `deviceId` (không có Device
   model). `signAccessToken`/`signRefreshToken` đều dùng `signAsync`.
2. **Login status check**: chặn `BANNED`/`BLOCKED`, cho phép `ACTIVE`/`INACTIVE`.
3. **Refresh token**: rotate mỗi lần — xoá record cũ trong DB, cấp cặp token
   mới, lưu refresh token mới. Nếu refresh token không còn trong DB →
   `RefreshTokenAlreadyUsedException` (reuse/theft detection).
4. **Forgot password**: sau khi đổi password thành công, xoá toàn bộ
   `RefreshToken` của user (revoke all sessions).

## Changes

### 1. `src/shared/types/jwt.type.ts`
- Xoá `JwtPayload` (number-based).
- `AccessTokenPayloadCreate { userId: string; roleId: string; roleName: string }`
- `JwtAccessTokenPayload extends AccessTokenPayloadCreate { exp: number; iat: number }`
- `RefreshTokenPayloadCreate { userId: string }`
- `JwtRefreshTokenPayload extends RefreshTokenPayloadCreate { exp: number; iat: number }`

### 2. `src/shared/services/token.service.ts`
- `signAccessToken(payload: AccessTokenPayloadCreate): Promise<string>` (signAsync)
- `signRefreshToken(payload: RefreshTokenPayloadCreate): Promise<string>` (signAsync, đổi từ sync)
- `verifyAccessToken(token): Promise<JwtAccessTokenPayload>`
- `verifyRefreshToken(token): Promise<JwtRefreshTokenPayload>`
- Thêm `decodeRefreshToken(token): JwtRefreshTokenPayload` (dùng `jwtService.decode`)
  để lấy `exp` → tính `expiresAt` khi lưu DB.

### 3. `src/routes/auth/auth.repo.ts` — thêm methods
- `findUserWithRoleByEmail(email: string)` → `prisma.user.findUnique({ where: { email }, include: { role: true } })`
- `findUserWithRoleById(id: string)` → tương tự theo `id`
- `createRefreshToken(data: { token: string; userId: string; expiresAt: Date })`
- `deleteRefreshToken(token: string)` → `prisma.refreshToken.delete({ where: { token } })`
- `deleteRefreshTokensByUserId(userId: string)` → `prisma.refreshToken.deleteMany({ where: { userId } })`
- `updateUserPassword(userId: string, password: string)` → `prisma.user.update(...)`

### 4. `src/routes/auth/errors/auth.errors.ts` — thêm
- `AccountBannedException = new ForbiddenException('Error.AccountBanned')`

### 5. `src/routes/auth/schemas/auth.model.ts` — fix bug
- `LoginBodyType` hiện bị gán nhầm `z.infer<typeof LoginResSchema>` → sửa
  thành `z.infer<typeof loginBodySchema>`.

### 6. `src/routes/auth/services/auth.service.ts`
Inject thêm `TokenService`. Thêm:

- **`loginService(body: LoginBodyType)`**
  1. `findUserWithRoleByEmail` → không có → `EmailNotFoundException`
  2. `status` là `BANNED`/`BLOCKED` → `AccountBannedException`
  3. `hashingService.compare` sai → `InvalidPasswordException`
  4. → `generateAuthResponse(user)`

- **`generateAuthResponse(user)`** (private, dùng chung login + refresh)
  1. Sign access token `{ userId, roleId, roleName: role.code }`
  2. Sign refresh token `{ userId }`
  3. `decodeRefreshToken` → `expiresAt = new Date(exp * 1000)`
  4. `createRefreshToken({ token, userId, expiresAt })`
  5. Trả `{ user: { id, email, name, displayName, phoneNumber, role: role.code }, accessToken, refreshToken }`

- **`logoutService(body: LogoutBodyType)`**
  1. `verifyRefreshToken` lỗi → `UnauthorizedAccessException`
  2. `deleteRefreshToken` — không tìm thấy (P2025 qua `isNotFoundError`) →
     `RefreshTokenAlreadyUsedException`
  3. Trả `{ message: 'Logout successful' }`

- **`refreshTokenService(body: RefreshTokenBodyType)`**
  1. `verifyRefreshToken` lỗi → `UnauthorizedAccessException`
  2. `deleteRefreshToken` (rotate) — không tìm thấy → `RefreshTokenAlreadyUsedException`
  3. `findUserWithRoleById(payload.userId)` — không có → `UnauthorizedAccessException`
  4. `status` BANNED/BLOCKED → `AccountBannedException`
  5. → `generateAuthResponse(user)`

- **`forgotPasswordService(body: ForgotPasswordBodyType)`**
  1. `sharedUsersRepository.findUnique({ email })` — không có → `EmailNotFoundException`
  2. `validateOtpCode({ email, otpCodeHash: code, purpose: FORGOT_PASSWORD })`
     (method đã có sẵn, throw `InvalidOTPException`/`OTPExpiredException`)
  3. Hash `newPassword`
  4. Parallel: `updateUserPassword`, `deleteOtpRequest`, `deleteRefreshTokensByUserId`
  5. Trả `{ message: 'Password reset successfully' }`

### 7. `src/routes/auth/auth.controller.ts` — thêm 4 endpoints, tất cả `@IsPublic()`

| Method | Path | Body DTO | Response DTO |
|---|---|---|---|
| POST | `/auth/login` | `LoginBodyDto` | `LoginResDto` |
| POST | `/auth/logout` | `LogoutBodyDto` | `MessageResDto` |
| POST | `/auth/refresh-token` | `RefreshTokenBodyDto` | `RefreshTokenResDto` |
| POST | `/auth/forgot-password` | `ForgotPasswordBodyDto` | `MessageResDto` |

## Out of scope
- RolesGuard / `@Roles()` decorator (chỉ embed roleId/roleName vào JWT để dùng sau).
- Account activation flow (status ACTIVE chưa được set ở đâu — không đụng tới).
- Email thông báo đổi mật khẩu thành công.
