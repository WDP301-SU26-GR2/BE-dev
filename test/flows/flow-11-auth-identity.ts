/**
 * FLOW 11 + A1 — Auth, Identity, Registration & Reputation
 * Spec §4 — 46 case.
 *
 * Nhóm:
 *   H  (12) happy: register → verify → login → refresh/logout → change/forgot password → admin create → profile
 *   V  (10) validation: type sai, pass yếu, phone không E.164, email trùng, OTP sai/hết hạn, login sai
 *   R  (12) RBAC/moderation: PasswordPolicyGuard, banned, admin ban/soft-delete/restore/reset, profile scope
 *   X  (12) rate-limit + reputation Bayesian + isRecommended + review gate
 */

import { OtpPurpose, RoleCode, UserStatus, StudioAssignmentStatus } from '@prisma/client'
import { wipeDb, seedRolesAndAdmin, prisma, makeUser, makeStudioAssignment, PW } from './lib/seed.js'
import { req, ok, section, summary, expectError, resetCounters, sleep } from './lib/http.js'
import { login, seedOtp, clearTokenCache } from './lib/auth.js'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@flowtest.local'
const FLOW = 'flow-11-auth-identity'
const FAKE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const PW_NEW = 'Reader!1234'

const regBody = (email: string, type: string, over: Record<string, unknown> = {}) => ({
  email,
  password: PW_NEW,
  confirm_password: PW_NEW,
  name: 'FT User',
  displayName: 'FTUser',
  phoneNumber: `+8490${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
  type,
  ...over
})

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await wipeDb()
  await seedRolesAndAdmin()
  clearTokenCache()

  const adminTok = await login(ADMIN_EMAIL)

  // ══════════════════ H — HAPPY PATH (12) ══════════════════
  section('H — Register → verify → login → token lifecycle')

  const email1 = `mangaka-${Date.now()}@flowtest.local`
  const r1 = await req('POST', '/auth/register', { body: regBody(email1, 'MANGAKA') })
  const u1 = await prisma.user.findUnique({ where: { email: email1 } })
  ok(
    'F11-001 register MANGAKA → 201 + status INACTIVE + emailVerified=false + SELF_REGISTERED',
    r1.status === 201 &&
      u1?.status === UserStatus.INACTIVE &&
      u1?.emailVerified === false &&
      u1?.registrationType === 'SELF_REGISTERED',
    `got ${r1.status} status=${String(u1?.status)}`
  )

  await seedOtp(email1, OtpPurpose.REGISTER)
  const r2 = await req('POST', '/auth/verify-email', { body: { email: email1, code: '123456' } })
  const u1v = await prisma.user.findUnique({ where: { email: email1 } })
  ok(
    'F11-002 verify-email đúng OTP → ACTIVE + emailVerified=true',
    r2.status === 201 && u1v?.status === UserStatus.ACTIVE && u1v?.emailVerified === true,
    `got ${r2.status} status=${String(u1v?.status)}`
  )

  const rLogin = await req('POST', '/auth/login', { body: { email: email1, password: PW_NEW } })
  const tok1 = rLogin.json?.data?.accessToken as string
  const refresh1 = rLogin.json?.data?.refreshToken as string
  ok(
    'F11-003 login → accessToken + refreshToken + mustChangePassword=false',
    rLogin.status === 201 && !!tok1 && !!refresh1 && rLogin.json?.data?.mustChangePassword === false,
    `got ${rLogin.status}`
  )

  const rProtected = await req('GET', '/series', { token: tok1 })
  ok('F11-004 route bảo vệ với token hợp lệ → 200', rProtected.status === 200, `got ${rProtected.status}`)

  // ⚠ Refresh JWT chỉ chứa {userId} + iat giây → 2 lần ký trong CÙNG 1 GIÂY sinh chuỗi TRÙNG NHAU
  // (token cũ === token mới) → không quan sát được rotation. Chờ >1s để iat khác nhau.
  // (Đây là đặc tính token, không phải bug rotation — rotation = delete-old-row, xem auth-token.service.)
  await sleep(1100)
  const rRef = await req('POST', '/auth/refresh-token', { body: { refreshToken: refresh1 } })
  const refresh2 = rRef.json?.data?.refreshToken as string
  ok(
    'F11-005a refresh-token → cặp token MỚI (khác token cũ)',
    rRef.status === 201 && !!refresh2 && refresh2 !== refresh1,
    `got ${rRef.status} same=${refresh2 === refresh1}`
  )
  const rRefReuse = await req('POST', '/auth/refresh-token', { body: { refreshToken: refresh1 } })
  expectError(
    rRefReuse,
    401,
    'Error.RefreshTokenAlreadyUsed',
    'F11-005b reuse refresh CŨ (đã rotate) → 401 RefreshTokenAlreadyUsed'
  )

  const rLogout = await req('POST', '/auth/logout', { body: { refreshToken: refresh2 } })
  ok('F11-006a logout → 201', rLogout.status === 201, `got ${rLogout.status}`)
  const rRefAfterLogout = await req('POST', '/auth/refresh-token', { body: { refreshToken: refresh2 } })
  ok('F11-006b refresh sau logout → 401', rRefAfterLogout.status === 401, `got ${rRefAfterLogout.status}`)

  // change-password → revoke toàn bộ refresh
  const rLogin2 = await req('POST', '/auth/login', { body: { email: email1, password: PW_NEW } })
  const tok1b = rLogin2.json?.data?.accessToken as string
  const refresh3 = rLogin2.json?.data?.refreshToken as string
  const rChange = await req('POST', '/auth/change-password', {
    token: tok1b,
    body: { currentPassword: PW_NEW, newPassword: 'Changed!123', confirmNewPassword: 'Changed!123' }
  })
  ok(
    'F11-007a change-password → 2xx',
    rChange.status === 200 || rChange.status === 201,
    `got ${rChange.status} ${rChange.raw.slice(0, 150)}`
  )
  const rRefRevoked = await req('POST', '/auth/refresh-token', { body: { refreshToken: refresh3 } })
  ok('F11-007b change-password → revoke toàn bộ refresh (401)', rRefRevoked.status === 401, `got ${rRefRevoked.status}`)
  const rLoginNew = await req('POST', '/auth/login', { body: { email: email1, password: 'Changed!123' } })
  ok('F11-007c login bằng pass mới → 201', rLoginNew.status === 201, `got ${rLoginNew.status}`)

  await seedOtp(email1, OtpPurpose.FORGOT_PASSWORD)
  const rForgot = await req('POST', '/auth/forgot-password', {
    body: { email: email1, code: '123456', newPassword: 'Forgot!1234', confirmNewPassword: 'Forgot!1234' }
  })
  const rLoginForgot = await req('POST', '/auth/login', { body: { email: email1, password: 'Forgot!1234' } })
  ok(
    'F11-008 forgot-password đúng OTP → đổi pass + login được',
    (rForgot.status === 200 || rForgot.status === 201) && rLoginForgot.status === 201,
    `forgot=${rForgot.status} login=${rLoginForgot.status} ${rForgot.raw.slice(0, 150)}`
  )

  const editorEmail = `editor-${Date.now()}@flowtest.local`
  const rAdminCreate = await req('POST', '/admin/users', {
    token: adminTok,
    body: { email: editorEmail, name: 'FT Editor', phoneNumber: '+84909999001', roleCode: 'EDITOR' }
  })
  const tempPw = rAdminCreate.json?.data?.temporaryPassword as string
  const editorRow = await prisma.user.findUnique({ where: { email: editorEmail } })
  ok(
    'F11-009 admin tạo EDITOR → 201 + ACTIVE + ADMIN_CREATED + mustChangePassword=true + temp password',
    rAdminCreate.status === 201 &&
      !!tempPw &&
      editorRow?.status === UserStatus.ACTIVE &&
      editorRow?.registrationType === 'ADMIN_CREATED' &&
      editorRow?.mustChangePassword === true,
    `got ${rAdminCreate.status} ${rAdminCreate.raw.slice(0, 160)}`
  )

  const mangakaTok = await login(email1, 'Forgot!1234')
  const rPutProfile = await req('PUT', '/me/mangaka-profile', {
    token: mangakaTok,
    body: { penName: 'FT Pen', genres: ['ACTION'], experienceLevel: 'SENIOR', bio: 'hi', portfolioFiles: [] }
  })
  const rGetProfile = await req('GET', '/me/mangaka-profile', { token: mangakaTok })
  ok(
    'F11-010 PUT|GET /me/mangaka-profile upsert + đọc lại khớp',
    rPutProfile.status === 200 && rGetProfile.status === 200 && rGetProfile.json?.data?.penName === 'FT Pen',
    `put=${rPutProfile.status} get=${rGetProfile.status}`
  )

  const freshMangaka = await makeUser(RoleCode.MANGAKA)
  const rPublicNoProfile = await req('GET', `/mangakas/${freshMangaka.id}`, { token: mangakaTok })
  ok(
    'F11-011 GET /mangakas/:id chưa build profile → graceful hasProfile:false + KHÔNG lộ email',
    rPublicNoProfile.status === 200 &&
      rPublicNoProfile.json?.data?.hasProfile === false &&
      !('email' in (rPublicNoProfile.json?.data ?? {})),
    `got ${rPublicNoProfile.status} ${rPublicNoProfile.raw.slice(0, 160)}`
  )

  const asstEmail = `assistant-${Date.now()}@flowtest.local`
  const rRegA = await req('POST', '/auth/register', { body: regBody(asstEmail, 'ASSISTANT') })
  await seedOtp(asstEmail, OtpPurpose.REGISTER)
  await req('POST', '/auth/verify-email', { body: { email: asstEmail, code: '123456' } })
  const asstTok = await login(asstEmail, PW_NEW)
  const rPutAsst = await req('PUT', '/me/assistant-profile', {
    token: asstTok,
    body: { specializations: ['INKING'], experienceLevel: 'MID', portfolioFiles: [] }
  })
  ok(
    'F11-012 register ASSISTANT + verify + PUT assistant-profile → 200',
    rRegA.status === 201 && rPutAsst.status === 200,
    `reg=${rRegA.status} profile=${rPutAsst.status}`
  )

  // ══════════════════ V — VALIDATION (10) ══════════════════
  section('V — Validation & error codes')

  const rTypeBad = await req('POST', '/auth/register', { body: regBody(`x-${Date.now()}@ft.local`, 'EDITOR') })
  ok('F11-013 register type=EDITOR → 422 (chỉ MANGAKA/ASSISTANT)', rTypeBad.status === 422, `got ${rTypeBad.status}`)

  const rWeak = await req('POST', '/auth/register', {
    body: regBody(`weak-${Date.now()}@ft.local`, 'MANGAKA', { password: 'abc', confirm_password: 'abc' })
  })
  ok('F11-014 password yếu → 422', rWeak.status === 422, `got ${rWeak.status}`)

  const rPhoneBad = await req('POST', '/auth/register', {
    body: regBody(`phone-${Date.now()}@ft.local`, 'MANGAKA', { phoneNumber: '0912345678' })
  })
  ok('F11-015 phoneNumber không E.164 → 422 (PA-09)', rPhoneBad.status === 422, `got ${rPhoneBad.status}`)

  const dupUser = await makeUser(RoleCode.MANGAKA)
  const rDup = await req('POST', '/auth/register', { body: regBody(dupUser.email, 'MANGAKA') })
  expectError(rDup, 409, 'Error.EmailAlreadyExists', 'F11-016 email đã tồn tại → 409 EmailAlreadyExists')

  const otpEmail = `otp-${Date.now()}@flowtest.local`
  await req('POST', '/auth/register', { body: regBody(otpEmail, 'MANGAKA') })
  await seedOtp(otpEmail, OtpPurpose.REGISTER)
  const rOtpWrong = await req('POST', '/auth/verify-email', { body: { email: otpEmail, code: '999999' } })
  expectError(rOtpWrong, 422, 'Error.InvalidOTP', 'F11-017a OTP sai → 422 InvalidOTP')
  // AUTH_OTP_MAX_ATTEMPTS = 5 (auth.constant) → lần thử thứ 6 mới bị khóa.
  for (let i = 0; i < 4; i++) {
    await req('POST', '/auth/verify-email', { body: { email: otpEmail, code: `99999${i}` } })
  }
  const rOtpLocked = await req('POST', '/auth/verify-email', { body: { email: otpEmail, code: '123456' } })
  expectError(rOtpLocked, 422, 'Error.OTPLocked', 'F11-017b OTP sai quá 5 lần → 422 OTPLocked (khóa cả code ĐÚNG)')

  const rOtpExpired = await prisma.otpRequest.updateMany({
    where: { email: otpEmail, purpose: OtpPurpose.REGISTER },
    data: { expiresAt: new Date(Date.now() - 60_000), attempts: 0, isUsed: false }
  })
  const rExp = await req('POST', '/auth/verify-email', { body: { email: otpEmail, code: '123456' } })
  ok(
    'F11-017c OTP hết hạn → 410 OTPExpired',
    rExp.status === 410 && rOtpExpired.count === 1,
    `got ${rExp.status} ${rExp.raw.slice(0, 120)}`
  )

  await seedOtp(email1, OtpPurpose.REGISTER)
  const rReVerify = await req('POST', '/auth/verify-email', { body: { email: email1, code: '123456' } })
  expectError(rReVerify, 409, 'Error.EmailAlreadyVerified', 'F11-018 verify lại khi đã verified → 409')

  const rBadPw = await req('POST', '/auth/login', { body: { email: dupUser.email, password: 'WrongPass!9' } })
  expectError(rBadPw, 422, 'Error.InvalidPassword', 'F11-019 login sai password → 422 InvalidPassword')

  const rNoEmail = await req('POST', '/auth/login', { body: { email: 'nobody@flowtest.local', password: PW } })
  expectError(rNoEmail, 422, 'Error.EmailNotFound', 'F11-020 login email không tồn tại → 422 EmailNotFound')

  const unverified = `unverified-${Date.now()}@flowtest.local`
  await req('POST', '/auth/register', { body: regBody(unverified, 'MANGAKA') })
  const rUnverified = await req('POST', '/auth/login', { body: { email: unverified, password: PW_NEW } })
  expectError(rUnverified, 403, 'Error.EmailNotVerified', 'F11-021 login khi chưa verify email → 403 EmailNotVerified')

  const rAdmin404 = await req('GET', `/admin/users/${FAKE_ID}`, { token: adminTok })
  expectError(rAdmin404, 404, 'Error.UserNotFound', 'F11-022 GET /admin/users/:id id không tồn tại → 404 UserNotFound')

  // ══════════════════ R — RBAC & MODERATION (12) ══════════════════
  section('R — RBAC, PasswordPolicyGuard, admin moderation')

  const rEditorLogin = await req('POST', '/auth/login', { body: { email: editorEmail, password: tempPw } })
  const editorTok = rEditorLogin.json?.data?.accessToken as string
  ok(
    'F11-023a login user mustChangePassword=true → 201 (token cấp, có cờ)',
    rEditorLogin.status === 201 && rEditorLogin.json?.data?.mustChangePassword === true,
    `got ${rEditorLogin.status}`
  )
  const rGuarded = await req('GET', '/series', { token: editorTok })
  ok('F11-023b PasswordPolicyGuard chặn route nghiệp vụ → 403', rGuarded.status === 403, `got ${rGuarded.status}`)
  const rEdChange = await req('POST', '/auth/change-password', {
    token: editorTok,
    body: { currentPassword: tempPw, newPassword: 'Editor!1234', confirmNewPassword: 'Editor!1234' }
  })
  const rEdRelogin = await req('POST', '/auth/login', { body: { email: editorEmail, password: 'Editor!1234' } })
  const editorTok2 = rEdRelogin.json?.data?.accessToken as string
  const rUnguarded = await req('GET', '/series', { token: editorTok2 })
  ok(
    'F11-023c sau change-password → hết chặn (GET /series 200)',
    (rEdChange.status === 200 || rEdChange.status === 201) &&
      rEdRelogin.json?.data?.mustChangePassword === false &&
      rUnguarded.status === 200,
    `change=${rEdChange.status} series=${rUnguarded.status}`
  )

  const banned = await makeUser(RoleCode.MANGAKA, { banned: true })
  const rBanLogin = await req('POST', '/auth/login', { body: { email: banned.email, password: PW } })
  expectError(rBanLogin, 403, 'Error.AccountBanned', 'F11-024 user BANNED login → 403 AccountBanned')

  const victim = await makeUser(RoleCode.MANGAKA)
  const victimLogin = await req('POST', '/auth/login', { body: { email: victim.email, password: PW } })
  const victimRefresh = victimLogin.json?.data?.refreshToken as string
  await req('PATCH', `/admin/users/${victim.id}/status`, {
    token: adminTok,
    body: { status: 'BANNED', reason: 'vi phạm' }
  })
  const rVictimRef = await req('POST', '/auth/refresh-token', { body: { refreshToken: victimRefresh } })
  ok(
    'F11-025 user bị BAN đang giữ token → refresh 401/403',
    [401, 403].includes(rVictimRef.status),
    `got ${rVictimRef.status}`
  )
  const rVictimLogin = await req('POST', '/auth/login', { body: { email: victim.email, password: PW } })
  expectError(rVictimLogin, 403, 'Error.AccountBanned', 'F11-028 admin ban → login fail')

  const rMangakaAdmin = await req('POST', '/admin/users', {
    token: mangakaTok,
    body: { email: 'x@ft.local', name: 'X', phoneNumber: '+84909999002', roleCode: 'EDITOR' }
  })
  ok('F11-026 POST /admin/users bởi MANGAKA → 403', rMangakaAdmin.status === 403, `got ${rMangakaAdmin.status}`)
  const rEditorAdmin = await req('GET', '/admin/users', { token: editorTok2 })
  ok('F11-027 GET /admin/users bởi EDITOR → 403', rEditorAdmin.status === 403, `got ${rEditorAdmin.status}`)

  const delUser = await makeUser(RoleCode.ASSISTANT)
  await req('DELETE', `/admin/users/${delUser.id}`, { token: adminTok })
  const rListDefault = await req('GET', `/admin/users?search=${encodeURIComponent(delUser.email)}`, { token: adminTok })
  const rListDeleted = await req(
    'GET',
    `/admin/users?search=${encodeURIComponent(delUser.email)}&includeDeleted=true`,
    { token: adminTok }
  )
  ok(
    'F11-029 soft-delete → ẩn khỏi list mặc định, hiện với includeDeleted=true',
    ((rListDefault.json?.data?.items ?? []) as unknown[]).length === 0 &&
      ((rListDeleted.json?.data?.items ?? []) as unknown[]).length === 1,
    `default=${((rListDefault.json?.data?.items ?? []) as unknown[]).length} withDeleted=${((rListDeleted.json?.data?.items ?? []) as unknown[]).length}`
  )
  const rRestore = await req('POST', `/admin/users/${delUser.id}/restore`, { token: adminTok, body: {} })
  const rLoginRestored = await req('POST', '/auth/login', { body: { email: delUser.email, password: PW } })
  ok(
    'F11-030 restore → login lại được',
    (rRestore.status === 200 || rRestore.status === 201) && rLoginRestored.status === 201,
    `restore=${rRestore.status} login=${rLoginRestored.status}`
  )

  const resetTarget = await makeUser(RoleCode.ASSISTANT)
  const rReset = await req('POST', `/admin/users/${resetTarget.id}/reset-password`, { token: adminTok, body: {} })
  const resetRow = await prisma.user.findUnique({ where: { id: resetTarget.id } })
  ok(
    'F11-031 admin reset-password → temp password + mustChangePassword=true',
    (rReset.status === 200 || rReset.status === 201) && resetRow?.mustChangePassword === true,
    `got ${rReset.status}`
  )

  const rWrongRole = await req('GET', `/mangakas/${resetTarget.id}`, { token: mangakaTok })
  ok('F11-032 GET /mangakas/:id với id của ASSISTANT → 404', rWrongRole.status === 404, `got ${rWrongRole.status}`)

  const softDeleted = await makeUser(RoleCode.MANGAKA)
  await req('DELETE', `/admin/users/${softDeleted.id}`, { token: adminTok })
  const rDeletedProfile = await req('GET', `/mangakas/${softDeleted.id}`, { token: mangakaTok })
  ok('F11-033 profile của user soft-deleted → 404', rDeletedProfile.status === 404, `got ${rDeletedProfile.status}`)

  const rAsstOnMangakaProfile = await req('GET', '/me/mangaka-profile', { token: asstTok })
  ok(
    'F11-034 GET /me/mangaka-profile bởi ASSISTANT → 403',
    rAsstOnMangakaProfile.status === 403,
    `got ${rAsstOnMangakaProfile.status}`
  )

  // ══════════════════ X — RATE-LIMIT + REPUTATION (12) ══════════════════
  section('X — Google login, OTP rate-limit, reputation Bayesian')

  const rGoogle = await req('POST', '/auth/google', { body: { idToken: 'garbage.token.here' } })
  expectError(rGoogle, 401, 'Error.InvalidGoogleToken', 'F11-035 google login token rác → 401 InvalidGoogleToken')

  // OTP rate-limit: cooldown giữa 2 lần xin OTP cùng email
  const rlEmail = `ratelimit-${Date.now()}@flowtest.local`
  await req('POST', '/auth/send-otp-email', { body: { email: rlEmail }, xff: '198.51.100.10' })
  const rRl2 = await req('POST', '/auth/send-otp-email', { body: { email: rlEmail }, xff: '198.51.100.10' })
  ok(
    'F11-036 xin OTP lại ngay (cooldown) → 429 + code + retryAfter',
    rRl2.status === 429 && typeof rRl2.json?.retryAfter === 'number' && typeof rRl2.json?.code === 'string',
    `got ${rRl2.status} ${rRl2.raw.slice(0, 140)}`
  )

  // rate-limit theo IP: email KHÁC NHAU (thoát cooldown per-email), cùng IP.
  // Quota IP = OTP_RL_IP_MAX (.env.flowtest = 20/giờ) → phải vượt 20 mới thấy 429.
  let ipBlocked = false
  let ipTries = 0
  for (let i = 0; i < 26; i++) {
    ipTries++
    const r = await req('POST', '/auth/send-otp-email', {
      body: { email: `ip-${Date.now()}-${i}@flowtest.local` },
      xff: '198.51.100.77'
    })
    if (r.status === 429) {
      ipBlocked = true
      break
    }
  }
  ok(`F11-037 rate-limit theo IP (quota OTP_RL_IP_MAX) → 429 sau ${ipTries} lần`, ipBlocked)

  // Reputation — cần assignment ĐÃ KẾT THÚC (A-TSK-08 gate) + target ĐÃ build profile
  // (reputation ghi lên profile; chưa có profile → 404 ProfileNotFound — xem F11-039b).
  const revMangaka = await makeUser(RoleCode.MANGAKA)
  const revMTok = await login(revMangaka.email)
  const revAsst = await makeUser(RoleCode.ASSISTANT)
  const revAsstTok = await login(revAsst.email)
  const asgActive = await makeStudioAssignment({ mangakaId: revMangaka.id, assistantId: revAsst.id })

  // Assistant CHƯA build profile → review phải 404 sạch (KHÔNG 500 — FINDING-BE-012)
  const asgNoProfile = await makeStudioAssignment({
    mangakaId: revMangaka.id,
    assistantId: (await makeUser(RoleCode.ASSISTANT)).id,
    status: StudioAssignmentStatus.TERMINATED
  })
  const rNoProfile = await req('POST', '/assistant-reviews', {
    token: revMTok,
    body: { assistantId: asgNoProfile.assistantId, rating: 5, studioAssignmentId: asgNoProfile.id }
  })
  expectError(
    rNoProfile,
    404,
    'Error.ProfileNotFound',
    'F11-039b review assistant CHƯA build profile → 404 ProfileNotFound (không 500)'
  )

  await req('PUT', '/me/assistant-profile', {
    token: revAsstTok,
    body: { specializations: ['INKING'], experienceLevel: 'MID', portfolioFiles: [] }
  })

  const rNoAsg = await req('POST', '/assistant-reviews', {
    token: revMTok,
    body: { assistantId: revAsst.id, rating: 5 }
  })
  ok('F11-038 assistant-review thiếu studioAssignmentId → 422', rNoAsg.status === 422, `got ${rNoAsg.status}`)

  const rActiveAsg = await req('POST', '/assistant-reviews', {
    token: revMTok,
    body: { assistantId: revAsst.id, rating: 5, studioAssignmentId: asgActive.id }
  })
  expectError(
    rActiveAsg,
    422,
    'Error.ReviewRequiresEndedAssignment',
    'F11-039 review khi assignment còn ACTIVE (hireEnd tương lai) → 422'
  )

  await prisma.studioAssignment.update({
    where: { id: asgActive.id },
    data: { status: StudioAssignmentStatus.TERMINATED }
  })
  const rRev1 = await req('POST', '/assistant-reviews', {
    token: revMTok,
    body: { assistantId: revAsst.id, rating: 5, studioAssignmentId: asgActive.id, comment: 'tốt' }
  })
  await sleep(400)
  const prof1 = await prisma.assistantProfile.findFirst({ where: { userId: revAsst.id } })
  ok(
    'F11-040 review hợp lệ (assignment TERMINATED) → ratingAvg/ratingCount cập nhật',
    rRev1.status === 201 && prof1?.ratingCount === 1 && prof1?.ratingAvg === 5,
    `got ${rRev1.status} count=${String(prof1?.ratingCount)} avg=${String(prof1?.ratingAvg)}`
  )
  ok(
    'F11-042 Bayesian: 1 review 5★ → score=(5·3.5+5)/6≈3.75 (KHÔNG phải 5.0)',
    Math.abs((prof1?.reputationScore ?? 0) - 3.75) < 0.01,
    `score=${String(prof1?.reputationScore)}`
  )
  ok(
    'F11-043 isRecommended=false khi ratingCount < 3',
    prof1?.isRecommended === false,
    `rec=${String(prof1?.isRecommended)}`
  )

  const rRevAgain = await req('POST', '/assistant-reviews', {
    token: revMTok,
    body: { assistantId: revAsst.id, rating: 4, studioAssignmentId: asgActive.id }
  })
  await sleep(400)
  const prof2 = await prisma.assistantProfile.findFirst({ where: { userId: revAsst.id } })
  ok(
    'F11-041 re-review cùng cặp = UPDATE (count giữ 1, avg đổi 4)',
    rRevAgain.status === 201 && prof2?.ratingCount === 1 && prof2?.ratingAvg === 4,
    `count=${String(prof2?.ratingCount)} avg=${String(prof2?.ratingAvg)}`
  )

  // 3 review ≥4★ từ 3 mangaka khác nhau → isRecommended=true
  for (let i = 0; i < 2; i++) {
    const mx = await makeUser(RoleCode.MANGAKA)
    const mxTok = await login(mx.email)
    const asg = await makeStudioAssignment({
      mangakaId: mx.id,
      assistantId: revAsst.id,
      status: StudioAssignmentStatus.TERMINATED
    })
    await req('POST', '/assistant-reviews', {
      token: mxTok,
      body: { assistantId: revAsst.id, rating: 5, studioAssignmentId: asg.id }
    })
  }
  await sleep(600)
  const prof3mid = await prisma.assistantProfile.findFirst({ where: { userId: revAsst.id } })
  // Bayesian: sum=4+5+5=14, count=3 → score=(5·3.5+14)/(5+3)=31.5/8=3.94 < 4.0 → CHƯA recommended.
  ok(
    'F11-043b count=3 nhưng score Bayesian 3.94 < 4.0 → vẫn isRecommended=false',
    prof3mid?.ratingCount === 3 &&
      Math.abs((prof3mid?.reputationScore ?? 0) - 3.94) < 0.02 &&
      prof3mid?.isRecommended === false,
    `count=${String(prof3mid?.ratingCount)} score=${String(prof3mid?.reputationScore)} rec=${String(prof3mid?.isRecommended)}`
  )

  // Nâng review đầu (4★ → 5★, upsert) → sum=15, count=3 → score=(17.5+15)/8=4.06 ≥ 4.0 → recommended.
  await req('POST', '/assistant-reviews', {
    token: revMTok,
    body: { assistantId: revAsst.id, rating: 5, studioAssignmentId: asgActive.id }
  })
  await sleep(600)
  const prof3 = await prisma.assistantProfile.findFirst({ where: { userId: revAsst.id } })
  ok(
    'F11-044 count=3 + score Bayesian 4.06 ≥ 4.0 → isRecommended=true (AC3)',
    prof3?.ratingCount === 3 && Math.abs((prof3?.reputationScore ?? 0) - 4.06) < 0.02 && prof3?.isRecommended === true,
    `count=${String(prof3?.ratingCount)} score=${String(prof3?.reputationScore)} rec=${String(prof3?.isRecommended)}`
  )

  const rSelfReview = await req('POST', '/mangaka-reviews', {
    token: revMTok, // MANGAKA gọi route EDITOR → 403 (route-level), nên dùng editor bên dưới cho self-review
    body: { mangakaId: revMangaka.id, rating: 5 }
  })
  ok(
    'F11-045a mangaka-review bởi MANGAKA → 403 (route EDITOR)',
    rSelfReview.status === 403,
    `got ${rSelfReview.status}`
  )

  const revEditor = await makeUser(RoleCode.EDITOR)
  const revETok = await login(revEditor.email)
  // Target mangaka phải có MangakaProfile (reputation ghi lên đó).
  await req('PUT', '/me/mangaka-profile', {
    token: revMTok,
    body: { penName: 'Rev Pen', genres: ['ACTION'], portfolioFiles: [] }
  })
  const rMR = await req('POST', '/mangaka-reviews', {
    token: revETok,
    body: { mangakaId: revMangaka.id, rating: 5, comment: 'chuyên nghiệp' }
  })
  await sleep(400)
  const mProf = await prisma.mangakaProfile.findFirst({ where: { userId: revMangaka.id } })
  ok(
    'F11-046 mangaka-review bởi EDITOR → OK + reputation lên MangakaProfile',
    rMR.status === 201 && mProf?.ratingCount === 1 && (mProf?.reputationScore ?? 0) > 0,
    `got ${rMR.status} count=${String(mProf?.ratingCount)} score=${String(mProf?.reputationScore)}`
  )

  const rReviewList = await req('GET', `/assistant-reviews?assistantId=${revAsst.id}`, { token: revMTok })
  ok(
    'F11-046b GET /assistant-reviews?assistantId= → 200 + items',
    rReviewList.status === 200 && ((rReviewList.json?.data?.items ?? []) as unknown[]).length === 3,
    `got ${rReviewList.status} items=${((rReviewList.json?.data?.items ?? []) as unknown[]).length}`
  )
  const rReviewNoQuery = await req('GET', '/assistant-reviews', { token: revMTok })
  ok(
    'F11-046c GET /assistant-reviews thiếu assistantId → 422',
    rReviewNoQuery.status === 422,
    `got ${rReviewNoQuery.status}`
  )

  // ──────────────────────────────────────────────────────────────────────────
  // Y — GET/PATCH /me + StaffProfile (Spec 12 Part A + B)
  // ──────────────────────────────────────────────────────────────────────────
  section('Y — /me self-service + staff profile (Spec 12)')

  // F11-070 — GET /me (MANGAKA) → 200; không password; role đúng
  const meM = await req('GET', '/me', { token: mangakaTok })
  ok('F11-070 GET /me (MANGAKA) 200', meM.status === 200, `got ${meM.status}`)
  ok('F11-070b KHÔNG password', !!meM.json?.data && !('password' in meM.json.data))
  ok('F11-070c role=MANGAKA', meM.json?.data?.role === 'MANGAKA')

  // F11-071 — PATCH /me displayName
  const p11 = await req('PATCH', '/me', { token: mangakaTok, body: { displayName: 'Kishi' } })
  ok('F11-071 PATCH /me displayName → 200', p11.status === 200, `got ${p11.status}`)
  ok('F11-071b áp dụng', p11.json?.data?.displayName === 'Kishi', JSON.stringify(p11.json?.data?.displayName))

  // F11-072 — PATCH /me displayName='' → CLEAR
  const p12 = await req('PATCH', '/me', { token: mangakaTok, body: { displayName: '' } })
  ok("F11-072 '' → displayName null", p12.json?.data?.displayName === null, JSON.stringify(p12.json?.data?.displayName))

  // F11-073 — PATCH /me displayName=null → GIỮ NGUYÊN
  await req('PATCH', '/me', { token: mangakaTok, body: { displayName: 'Test' } })
  const p13 = await req('PATCH', '/me', { token: mangakaTok, body: { displayName: null } })
  ok('F11-073 null → no-op', p13.json?.data?.displayName === 'Test', JSON.stringify(p13.json?.data?.displayName))

  // F11-074 — PATCH /me { email } → 422 (strict, BE trả ZodValidation message[] tiếng Anh)
  const p14 = await req('PATCH', '/me', { token: mangakaTok, body: { email: 'x@y.z' } })
  ok('F11-074 PATCH email → 422', p14.status === 422, `got ${p14.status}`)

  // F11-075 — PATCH /me { role: 'SUPER_ADMIN' } → 422
  const p15 = await req('PATCH', '/me', { token: mangakaTok, body: { role: 'SUPER_ADMIN' } })
  ok('F11-075 PATCH role → 422', p15.status === 422, `got ${p15.status}`)

  // F11-076 — PATCH /me phoneNumber non-E.164 → 422
  const p16 = await req('PATCH', '/me', { token: mangakaTok, body: { phoneNumber: '0912345678' } })
  ok('F11-076 PATCH phone non-E.164 → 422', p16.status === 422, `got ${p16.status}`)

  // F11-077 — PATCH /me name 'A' (< 2 chars) → 422
  const p17 = await req('PATCH', '/me', { token: mangakaTok, body: { name: 'A' } })
  ok('F11-077 PATCH name < 2 chars → 422', p17.status === 422, `got ${p17.status}`)

  // F11-078 — GET /me KHÔNG token → 401
  const meNo = await req('GET', '/me', {})
  ok('F11-078 GET /me no token → 401', meNo.status === 401, `got ${meNo.status}`)

  // F11-079 — PUT /me/staff-profile (EDITOR) → 200 hasProfile=true
  const sp1 = await req('PUT', '/me/staff-profile', {
    token: editorTok2,
    body: { specialtyGenres: ['ACTION'], demographics: ['SHONEN'], bio: 'test', yearsOfExperience: 3 }
  })
  ok('F11-079 PUT /me/staff-profile (EDITOR) 200', sp1.status === 200, `got ${sp1.status}`)
  ok('F11-079b hasProfile=true', sp1.json?.data?.hasProfile === true)

  // F11-080 — PUT /me/staff-profile (MANGAKA) → 403 (RolesGuard generic)
  const spDenied = await req('PUT', '/me/staff-profile', {
    token: mangakaTok,
    body: { specialtyGenres: [] }
  })
  ok('F11-080 PUT /me/staff-profile (MANGAKA) → 403', spDenied.status === 403, `got ${spDenied.status}`)

  // F11-081 — GET /staff/:editorId → 200 hasProfile=true (dùng editor từ setup)
  const editorId = rAdminCreate.json?.data?.id as string
  const stE = await req('GET', `/staff/${editorId}`, { token: mangakaTok })
  ok('F11-081 GET /staff/:editorId 200', stE.status === 200, `got ${stE.status}`)

  // F11-082 — GET /staff/:boardId chưa build hồ sơ → 200 hasProfile:false (graceful)
  // Tạo 1 board member mới, KHÔNG tạo StaffProfile cho họ.
  const staffBoard = await makeUser(RoleCode.BOARD_MEMBER)
  const staffBoardTok = await login(staffBoard.email)
  const stBoard = await req('GET', `/staff/${staffBoard.id}`, { token: mangakaTok })
  ok(
    'F11-082 GET /staff/:boardId no profile → 200 hasProfile=false',
    stBoard.status === 200 && stBoard.json?.data?.hasProfile === false,
    `got ${stBoard.status} ${JSON.stringify(stBoard.json?.data?.hasProfile)}`
  )

  // F11-083 — PUT /me/staff-profile (BOARD_MEMBER) → 200
  const spBoard = await req('PUT', '/me/staff-profile', {
    token: staffBoardTok,
    body: { specialtyGenres: ['ROMANCE'], demographics: ['SHOJO'] }
  })
  ok('F11-083 PUT /me/staff-profile (BOARD_MEMBER) 200', spBoard.status === 200, `got ${spBoard.status}`)

  // F11-084 — PUT /me/staff-profile (ASSISTANT) → 403 (RolesGuard generic)
  const spAsst = await req('PUT', '/me/staff-profile', { token: asstTok, body: { specialtyGenres: [] } })
  ok('F11-084 PUT /me/staff-profile (ASSISTANT) → 403', spAsst.status === 403, `got ${spAsst.status}`)

  // F11-085 — GET /staff/:mangakaId → 404 (sai role — StaffProfile chỉ cho EDITOR/BOARD)
  const stMg = await req('GET', `/staff/${(await prisma.user.findFirst({ where: { email: email1 } }))?.id}`, {
    token: mangakaTok
  })
  ok('F11-085 GET /staff/:mangakaId → 404', stMg.status === 404, `got ${stMg.status}`)

  // F11-086 — GET /staff/garbage → 404 (id rác, KHÔNG 500)
  const stGhost = await req('GET', `/staff/${FAKE_ID}`, { token: mangakaTok })
  ok('F11-086 GET /staff/garbage → 404', stGhost.status === 404, `got ${stGhost.status}`)

  await prisma.$disconnect()
  const fail = summary(FLOW)
  await sleep(300)
  process.exit(fail > 0 ? 1 : 0)
}

void main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
