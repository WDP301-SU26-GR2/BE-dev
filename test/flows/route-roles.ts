// ⚠ FILE SINH TỰ ĐỘNG bởi _generate-route-roles.ts — ĐỪNG SỬA TAY.
// Sinh từ Reflect metadata runtime (PATH/METHOD/ROLES/AUTH_TYPE) của dist/ thật.
// Regenerate: pnpm build && pnpm flowtest:one test/flows/_generate-route-roles.ts
// Sinh lúc: 2026-07-20T19:40:19.916Z — 263 routes.
//
// access:
//   PUBLIC — @IsPublic(), không cần token (none/mọi role đều KHÔNG bị 401/403)
//   AUTH   — cần Bearer, không giới hạn role (none → 401; mọi role qua)
//   ROLES  — cần Bearer + @Roles(...) (none → 401; role ∉ allowed → 403)

import { RoleCode } from '@prisma/client'

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
export type RouteAccess = 'PUBLIC' | 'AUTH' | 'ROLES'

export type RouteRule = {
  method: HttpMethod
  path: string
  access: RouteAccess
  allowed: RoleCode[]
}

export const ROLE_FIXTURES_ORDER: RoleCode[] = [
  RoleCode.SUPER_ADMIN,
  RoleCode.MANGAKA,
  RoleCode.ASSISTANT,
  RoleCode.EDITOR,
  RoleCode.BOARD_MEMBER
]

export const ROUTE_RULES: RouteRule[] = [
  { method: 'GET', path: '/admin/app-config', access: 'ROLES', allowed: [RoleCode.SUPER_ADMIN] },
  { method: 'PATCH', path: '/admin/app-config', access: 'ROLES', allowed: [RoleCode.SUPER_ADMIN] },
  { method: 'GET', path: '/admin/stats', access: 'ROLES', allowed: [RoleCode.SUPER_ADMIN] },
  { method: 'GET', path: '/admin/users', access: 'ROLES', allowed: [RoleCode.SUPER_ADMIN] },
  { method: 'POST', path: '/admin/users', access: 'ROLES', allowed: [RoleCode.SUPER_ADMIN] },
  { method: 'DELETE', path: '/admin/users/:id', access: 'ROLES', allowed: [RoleCode.SUPER_ADMIN] },
  { method: 'GET', path: '/admin/users/:id', access: 'ROLES', allowed: [RoleCode.SUPER_ADMIN] },
  { method: 'POST', path: '/admin/users/:id/reset-password', access: 'ROLES', allowed: [RoleCode.SUPER_ADMIN] },
  { method: 'POST', path: '/admin/users/:id/restore', access: 'ROLES', allowed: [RoleCode.SUPER_ADMIN] },
  { method: 'PATCH', path: '/admin/users/:id/status', access: 'ROLES', allowed: [RoleCode.SUPER_ADMIN] },
  { method: 'GET', path: '/ai-jobs/:id', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/ai-jobs/:id/apply', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'GET', path: '/annotations', access: 'AUTH', allowed: [] },
  { method: 'POST', path: '/annotations', access: 'AUTH', allowed: [] },
  { method: 'DELETE', path: '/annotations/:id', access: 'AUTH', allowed: [] },
  { method: 'PATCH', path: '/annotations/:id/resolve', access: 'AUTH', allowed: [] },
  { method: 'GET', path: '/assistant-reviews', access: 'AUTH', allowed: [] },
  { method: 'POST', path: '/assistant-reviews', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  {
    method: 'GET',
    path: '/assistants',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  { method: 'GET', path: '/assistants/:userId', access: 'AUTH', allowed: [] },
  { method: 'GET', path: '/audit', access: 'ROLES', allowed: [RoleCode.SUPER_ADMIN, RoleCode.BOARD_MEMBER] },
  { method: 'POST', path: '/auth/change-password', access: 'AUTH', allowed: [] },
  { method: 'POST', path: '/auth/forgot-password', access: 'PUBLIC', allowed: [] },
  { method: 'POST', path: '/auth/google', access: 'PUBLIC', allowed: [] },
  { method: 'POST', path: '/auth/login', access: 'PUBLIC', allowed: [] },
  { method: 'POST', path: '/auth/logout', access: 'PUBLIC', allowed: [] },
  { method: 'POST', path: '/auth/refresh-token', access: 'PUBLIC', allowed: [] },
  { method: 'POST', path: '/auth/register', access: 'PUBLIC', allowed: [] },
  { method: 'POST', path: '/auth/send-otp-email', access: 'PUBLIC', allowed: [] },
  { method: 'POST', path: '/auth/verify-email', access: 'PUBLIC', allowed: [] },
  {
    method: 'GET',
    path: '/board/config',
    access: 'ROLES',
    allowed: [RoleCode.SUPER_ADMIN, RoleCode.BOARD_MEMBER, RoleCode.EDITOR]
  },
  { method: 'PATCH', path: '/board/config/:id', access: 'ROLES', allowed: [RoleCode.SUPER_ADMIN] },
  {
    method: 'GET',
    path: '/board/decisions',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN, RoleCode.BOARD_MEMBER]
  },
  { method: 'POST', path: '/board/decisions', access: 'ROLES', allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN] },
  {
    method: 'GET',
    path: '/board/decisions/:id',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN, RoleCode.BOARD_MEMBER]
  },
  {
    method: 'POST',
    path: '/board/decisions/:id/vote',
    access: 'ROLES',
    allowed: [RoleCode.BOARD_MEMBER, RoleCode.EDITOR]
  },
  {
    method: 'GET',
    path: '/board/decisions/:id/votes',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN, RoleCode.BOARD_MEMBER]
  },
  {
    method: 'GET',
    path: '/board/reports',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN, RoleCode.BOARD_MEMBER]
  },
  { method: 'POST', path: '/board/reports', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  {
    method: 'GET',
    path: '/board/reports/:id',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN, RoleCode.BOARD_MEMBER]
  },
  {
    method: 'GET',
    path: '/board/sessions',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN, RoleCode.BOARD_MEMBER]
  },
  { method: 'POST', path: '/board/sessions', access: 'ROLES', allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN] },
  {
    method: 'GET',
    path: '/board/sessions/:id',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN, RoleCode.BOARD_MEMBER]
  },
  {
    method: 'PATCH',
    path: '/board/sessions/:id/conclude',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN]
  },
  {
    method: 'GET',
    path: '/board/sessions/:id/messages',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN, RoleCode.BOARD_MEMBER]
  },
  {
    method: 'PATCH',
    path: '/board/sessions/:id/phase',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN]
  },
  {
    method: 'PATCH',
    path: '/board/sessions/:id/start',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN]
  },
  { method: 'GET', path: '/board/suggest-members', access: 'ROLES', allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN] },
  { method: 'GET', path: '/chapters', access: 'AUTH', allowed: [] },
  { method: 'POST', path: '/chapters', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'DELETE', path: '/chapters/:id', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'GET', path: '/chapters/:id', access: 'AUTH', allowed: [] },
  { method: 'PATCH', path: '/chapters/:id', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/chapters/:id/co-owner-approve', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/chapters/:id/co-owner-reject', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/chapters/:id/hold', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/chapters/:id/manuscript/approve', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/chapters/:id/manuscript/request-revision', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/chapters/:id/manuscript/resubmit', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/chapters/:id/manuscript/submit', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  {
    method: 'GET',
    path: '/chapters/:id/names',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  { method: 'POST', path: '/chapters/:id/names', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'DELETE', path: '/chapters/:id/names/:nameId', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  {
    method: 'GET',
    path: '/chapters/:id/names/:nameId',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  { method: 'POST', path: '/chapters/:id/names/:nameId/approve', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/chapters/:id/names/:nameId/pages', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'PUT', path: '/chapters/:id/names/:nameId/pages', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/chapters/:id/names/:nameId/request-revision', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/chapters/:id/names/:nameId/resubmit', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/chapters/:id/names/:nameId/submit', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'DELETE', path: '/chapters/:id/pages', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  {
    method: 'GET',
    path: '/chapters/:id/pages',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR, RoleCode.ASSISTANT, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  { method: 'POST', path: '/chapters/:id/pages', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  {
    method: 'GET',
    path: '/chapters/:id/progress',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  { method: 'POST', path: '/chapters/:id/publish', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/chapters/:id/resume', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'PUT', path: '/chapters/:id/schedule', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'PATCH', path: '/chapters/:id/schedule/extend', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'GET', path: '/collaboration-invites', access: 'ROLES', allowed: [RoleCode.MANGAKA, RoleCode.ASSISTANT] },
  { method: 'POST', path: '/collaboration-invites', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  {
    method: 'GET',
    path: '/collaboration-invites/:id',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.ASSISTANT]
  },
  { method: 'POST', path: '/collaboration-invites/:id/accept', access: 'ROLES', allowed: [RoleCode.ASSISTANT] },
  { method: 'POST', path: '/collaboration-invites/:id/cancel', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/collaboration-invites/:id/decline', access: 'ROLES', allowed: [RoleCode.ASSISTANT] },
  {
    method: 'GET',
    path: '/contracts',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.MANGAKA, RoleCode.BOARD_MEMBER]
  },
  { method: 'POST', path: '/contracts', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  {
    method: 'GET',
    path: '/contracts/:contractId/amendments',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.MANGAKA, RoleCode.BOARD_MEMBER]
  },
  { method: 'POST', path: '/contracts/:contractId/amendments', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  {
    method: 'GET',
    path: '/contracts/:contractId/amendments/:id',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.MANGAKA, RoleCode.BOARD_MEMBER]
  },
  { method: 'PATCH', path: '/contracts/:contractId/amendments/:id', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  {
    method: 'POST',
    path: '/contracts/:contractId/amendments/:id/reject',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA]
  },
  {
    method: 'POST',
    path: '/contracts/:contractId/amendments/:id/sign/board',
    access: 'ROLES',
    allowed: [RoleCode.BOARD_MEMBER]
  },
  {
    method: 'POST',
    path: '/contracts/:contractId/amendments/:id/sign/mangaka',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA]
  },
  { method: 'POST', path: '/contracts/:contractId/amendments/:id/submit', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/contracts/:contractId/amendments/:id/void', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  {
    method: 'GET',
    path: '/contracts/:contractId/payment-conditions',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.MANGAKA, RoleCode.BOARD_MEMBER]
  },
  { method: 'POST', path: '/contracts/:contractId/payment-conditions', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  {
    method: 'PATCH',
    path: '/contracts/:contractId/payment-conditions/:conditionId',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR]
  },
  {
    method: 'PATCH',
    path: '/contracts/:contractId/payment-conditions/:conditionId/disable',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR]
  },
  {
    method: 'GET',
    path: '/contracts/:id',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.MANGAKA, RoleCode.BOARD_MEMBER]
  },
  { method: 'PATCH', path: '/contracts/:id', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/contracts/:id/board-approve', access: 'ROLES', allowed: [RoleCode.BOARD_MEMBER] },
  { method: 'POST', path: '/contracts/:id/board-request-changes', access: 'ROLES', allowed: [RoleCode.BOARD_MEMBER] },
  {
    method: 'GET',
    path: '/contracts/:id/pdf',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.MANGAKA, RoleCode.BOARD_MEMBER]
  },
  { method: 'POST', path: '/contracts/:id/request-changes', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  {
    method: 'POST',
    path: '/contracts/:id/revenue',
    access: 'ROLES',
    allowed: [RoleCode.BOARD_MEMBER, RoleCode.EDITOR]
  },
  { method: 'POST', path: '/contracts/:id/signatures/board', access: 'ROLES', allowed: [RoleCode.BOARD_MEMBER] },
  { method: 'POST', path: '/contracts/:id/signatures/mangaka', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  {
    method: 'GET',
    path: '/contracts/:id/status',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.MANGAKA, RoleCode.BOARD_MEMBER]
  },
  { method: 'PATCH', path: '/contracts/:id/status', access: 'ROLES', allowed: [RoleCode.EDITOR, RoleCode.MANGAKA] },
  {
    method: 'GET',
    path: '/contracts/:id/versions',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.MANGAKA, RoleCode.BOARD_MEMBER]
  },
  {
    method: 'GET',
    path: '/contracts/:id/versions/:versionId',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.MANGAKA, RoleCode.BOARD_MEMBER]
  },
  { method: 'GET', path: '/contracts/health', access: 'AUTH', allowed: [] },
  { method: 'GET', path: '/dashboard/admin', access: 'ROLES', allowed: [RoleCode.SUPER_ADMIN] },
  { method: 'GET', path: '/dashboard/assistant', access: 'ROLES', allowed: [RoleCode.ASSISTANT] },
  { method: 'GET', path: '/dashboard/board', access: 'ROLES', allowed: [RoleCode.BOARD_MEMBER] },
  { method: 'GET', path: '/dashboard/editor', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'GET', path: '/dashboard/mangaka', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'GET', path: '/dashboard/mangaka/earnings', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  {
    method: 'GET',
    path: '/deadline-requests',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  { method: 'POST', path: '/deadline-requests', access: 'ROLES', allowed: [RoleCode.MANGAKA, RoleCode.EDITOR] },
  {
    method: 'GET',
    path: '/deadline-requests/:id',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  {
    method: 'POST',
    path: '/deadline-requests/:id/agree',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR]
  },
  { method: 'POST', path: '/deadline-requests/:id/board-resolve', access: 'ROLES', allowed: [RoleCode.BOARD_MEMBER] },
  {
    method: 'POST',
    path: '/deadline-requests/:id/counter',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR]
  },
  { method: 'POST', path: '/deadline-requests/:id/finalize', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  {
    method: 'POST',
    path: '/deadline-requests/:id/reject',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR]
  },
  {
    method: 'POST',
    path: '/deadline-requests/:id/withdraw',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR]
  },
  { method: 'GET', path: '/mangaka-reviews', access: 'AUTH', allowed: [] },
  { method: 'POST', path: '/mangaka-reviews', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  {
    method: 'GET',
    path: '/mangakas',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN, RoleCode.MANGAKA]
  },
  { method: 'GET', path: '/mangakas/:userId', access: 'AUTH', allowed: [] },
  { method: 'GET', path: '/me', access: 'AUTH', allowed: [] },
  { method: 'PATCH', path: '/me', access: 'AUTH', allowed: [] },
  { method: 'GET', path: '/me/assistant-profile', access: 'ROLES', allowed: [RoleCode.ASSISTANT] },
  { method: 'PUT', path: '/me/assistant-profile', access: 'ROLES', allowed: [RoleCode.ASSISTANT] },
  { method: 'GET', path: '/me/mangaka-profile', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'PUT', path: '/me/mangaka-profile', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'GET', path: '/me/staff-profile', access: 'ROLES', allowed: [RoleCode.EDITOR, RoleCode.BOARD_MEMBER] },
  { method: 'PUT', path: '/me/staff-profile', access: 'ROLES', allowed: [RoleCode.EDITOR, RoleCode.BOARD_MEMBER] },
  { method: 'GET', path: '/notifications', access: 'AUTH', allowed: [] },
  { method: 'PATCH', path: '/notifications/:id/read', access: 'AUTH', allowed: [] },
  { method: 'PATCH', path: '/notifications/read-all', access: 'AUTH', allowed: [] },
  { method: 'GET', path: '/pages/:id/ai-jobs', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'GET', path: '/pages/:id/regions', access: 'ROLES', allowed: [RoleCode.MANGAKA, RoleCode.EDITOR] },
  { method: 'POST', path: '/pages/:id/regions', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/pages/:id/segment', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'DELETE', path: '/pages/:pageId', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'PATCH', path: '/pages/:pageId', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'GET', path: '/payments', access: 'ROLES', allowed: [RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN] },
  {
    method: 'GET',
    path: '/payments/:id',
    access: 'ROLES',
    allowed: [RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN, RoleCode.MANGAKA, RoleCode.EDITOR]
  },
  { method: 'PATCH', path: '/payments/:id/approve', access: 'ROLES', allowed: [RoleCode.BOARD_MEMBER] },
  {
    method: 'PATCH',
    path: '/payments/:id/cancel',
    access: 'ROLES',
    allowed: [RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  {
    method: 'PATCH',
    path: '/payments/:id/pay',
    access: 'ROLES',
    allowed: [RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  {
    method: 'GET',
    path: '/payments/contracts/:id/payments',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  {
    method: 'GET',
    path: '/payments/series/:id/payments',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  {
    method: 'GET',
    path: '/payments/users/:id/payments',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  { method: 'GET', path: '/public/chapters/:id/pages', access: 'PUBLIC', allowed: [] },
  { method: 'GET', path: '/public/series', access: 'PUBLIC', allowed: [] },
  { method: 'GET', path: '/public/series/:id', access: 'PUBLIC', allowed: [] },
  {
    method: 'DELETE',
    path: '/publication-versions/:id',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN]
  },
  {
    method: 'GET',
    path: '/publication-versions/:id',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN, RoleCode.MANGAKA]
  },
  {
    method: 'PATCH',
    path: '/publication-versions/:id',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN]
  },
  {
    method: 'GET',
    path: '/rankings',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  {
    method: 'GET',
    path: '/rankings/board',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  { method: 'DELETE', path: '/regions/:id', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'PATCH', path: '/regions/:id', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  {
    method: 'GET',
    path: '/reprint-requests',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.MANGAKA, RoleCode.SUPER_ADMIN]
  },
  { method: 'POST', path: '/reprint-requests', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  {
    method: 'GET',
    path: '/reprint-requests/:id',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.MANGAKA, RoleCode.SUPER_ADMIN]
  },
  { method: 'PATCH', path: '/reprint-requests/:id/board-approve', access: 'ROLES', allowed: [RoleCode.BOARD_MEMBER] },
  {
    method: 'GET',
    path: '/reprint-requests/:id/chapters',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.MANGAKA, RoleCode.SUPER_ADMIN]
  },
  {
    method: 'GET',
    path: '/reprint-requests/:id/chapters/:chapterId',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.MANGAKA, RoleCode.SUPER_ADMIN]
  },
  {
    method: 'PATCH',
    path: '/reprint-requests/:id/chapters/:chapterId/approve',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR]
  },
  {
    method: 'PATCH',
    path: '/reprint-requests/:id/chapters/:chapterId/assign-reviser',
    access: 'ROLES',
    allowed: [RoleCode.BOARD_MEMBER, RoleCode.EDITOR]
  },
  {
    method: 'PATCH',
    path: '/reprint-requests/:id/chapters/:chapterId/manuscript',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA]
  },
  { method: 'PATCH', path: '/reprint-requests/:id/mangaka-review', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  {
    method: 'GET',
    path: '/revision-requests',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.ASSISTANT, RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  {
    method: 'PATCH',
    path: '/revision-requests/:id/resolve',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.ASSISTANT]
  },
  {
    method: 'GET',
    path: '/series',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  {
    method: 'GET',
    path: '/series/:id',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  { method: 'PATCH', path: '/series/:id', access: 'ROLES', allowed: [RoleCode.MANGAKA, RoleCode.EDITOR] },
  { method: 'POST', path: '/series/:id/claim', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  {
    method: 'GET',
    path: '/series/:id/defense-dashboard',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  { method: 'POST', path: '/series/:id/finalize-ending', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/series/:id/force-cancel', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/series/:id/franchise-consent', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/series/:id/hiatus', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  {
    method: 'GET',
    path: '/series/:id/names',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  {
    method: 'GET',
    path: '/series/:id/names/:nameId',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN]
  },
  { method: 'POST', path: '/series/:id/names/:nameId/approve', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/series/:id/names/:nameId/pages', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'PUT', path: '/series/:id/names/:nameId/pages', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/series/:id/names/:nameId/request-revision', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/series/:id/names/:nameId/resubmit', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/series/:id/pitch', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/series/:id/proposal/approve', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/series/:id/proposal/request-revision', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/series/:id/proposal/resubmit', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  {
    method: 'POST',
    path: '/series/:id/propose-completion',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR]
  },
  { method: 'POST', path: '/series/:id/reject', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/series/:id/release', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/series/:id/reopen', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/series/:id/reopen-review', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/series/:id/resume', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'POST', path: '/series/:id/submit', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/series/:id/withdraw', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  {
    method: 'GET',
    path: '/series/:seriesId/publication-versions',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.BOARD_MEMBER, RoleCode.SUPER_ADMIN, RoleCode.MANGAKA]
  },
  {
    method: 'POST',
    path: '/series/:seriesId/publication-versions',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN]
  },
  { method: 'POST', path: '/series/proposals', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'DELETE', path: '/series/proposals/:id', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'PUT', path: '/series/proposals/:id', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'GET', path: '/staff/:userId', access: 'AUTH', allowed: [] },
  { method: 'GET', path: '/studio-assignments', access: 'ROLES', allowed: [RoleCode.MANGAKA, RoleCode.ASSISTANT] },
  { method: 'GET', path: '/studio-assignments/:id', access: 'ROLES', allowed: [RoleCode.MANGAKA, RoleCode.ASSISTANT] },
  { method: 'POST', path: '/studio-assignments/:id/terminate', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'GET', path: '/studio/overview', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/survey-data/import', access: 'ROLES', allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN] },
  {
    method: 'GET',
    path: '/survey-periods',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN, RoleCode.BOARD_MEMBER]
  },
  { method: 'POST', path: '/survey-periods', access: 'ROLES', allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN] },
  {
    method: 'GET',
    path: '/survey-periods/:id',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN, RoleCode.BOARD_MEMBER]
  },
  {
    method: 'POST',
    path: '/survey-periods/:id/finalize',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN]
  },
  {
    method: 'GET',
    path: '/survey-periods/:id/rankings',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN, RoleCode.BOARD_MEMBER]
  },
  {
    method: 'PATCH',
    path: '/survey-periods/:id/status',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN]
  },
  {
    method: 'GET',
    path: '/survey-periods/:id/survey-data',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN, RoleCode.BOARD_MEMBER]
  },
  {
    method: 'GET',
    path: '/survey-periods/:id/votes',
    access: 'ROLES',
    allowed: [RoleCode.EDITOR, RoleCode.SUPER_ADMIN, RoleCode.BOARD_MEMBER]
  },
  { method: 'POST', path: '/tankobon-sales', access: 'ROLES', allowed: [RoleCode.EDITOR, RoleCode.BOARD_MEMBER] },
  { method: 'GET', path: '/tasks', access: 'ROLES', allowed: [RoleCode.MANGAKA, RoleCode.ASSISTANT] },
  { method: 'POST', path: '/tasks', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'GET', path: '/tasks/:id', access: 'ROLES', allowed: [RoleCode.MANGAKA, RoleCode.ASSISTANT] },
  { method: 'PATCH', path: '/tasks/:id', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/tasks/:id/approve', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/tasks/:id/cancel', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/tasks/:id/reassign', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/tasks/:id/request-revision', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/tasks/:id/start', access: 'ROLES', allowed: [RoleCode.ASSISTANT] },
  { method: 'POST', path: '/tasks/:id/submit', access: 'ROLES', allowed: [RoleCode.ASSISTANT] },
  { method: 'POST', path: '/tasks/batch', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/tasks/group', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/tasks/group/:groupId/approve', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/transfers/contracts', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  {
    method: 'POST',
    path: '/transfers/contracts/:id/sign',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.BOARD_MEMBER]
  },
  {
    method: 'GET',
    path: '/transfers/contracts/:id/signatures',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR, RoleCode.BOARD_MEMBER]
  },
  { method: 'POST', path: '/transfers/requests', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  {
    method: 'GET',
    path: '/transfers/requests/:id',
    access: 'ROLES',
    allowed: [RoleCode.MANGAKA, RoleCode.EDITOR, RoleCode.BOARD_MEMBER]
  },
  {
    method: 'POST',
    path: '/transfers/requests/:id/assign-full-buyout',
    access: 'ROLES',
    allowed: [RoleCode.BOARD_MEMBER]
  },
  { method: 'POST', path: '/transfers/requests/:id/board-approve', access: 'ROLES', allowed: [RoleCode.BOARD_MEMBER] },
  { method: 'POST', path: '/transfers/requests/:id/board-reject', access: 'ROLES', allowed: [RoleCode.BOARD_MEMBER] },
  { method: 'POST', path: '/transfers/requests/:id/mangaka-accept', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/transfers/requests/:id/mangaka-reject', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'POST', path: '/transfers/requests/:id/start-negotiation', access: 'ROLES', allowed: [RoleCode.EDITOR] },
  { method: 'GET', path: '/transfers/requests/mine', access: 'ROLES', allowed: [RoleCode.MANGAKA] },
  { method: 'GET', path: '/transfers/requests/pending-board', access: 'ROLES', allowed: [RoleCode.BOARD_MEMBER] },
  { method: 'POST', path: '/uploads/sign', access: 'AUTH', allowed: [] },
  { method: 'POST', path: '/uploads/sign-download', access: 'AUTH', allowed: [] },
  { method: 'POST', path: '/vote', access: 'PUBLIC', allowed: [] },
  { method: 'GET', path: '/vote/context', access: 'PUBLIC', allowed: [] },
  { method: 'POST', path: '/vote/otp', access: 'PUBLIC', allowed: [] },
  { method: 'GET', path: '/vote/periods', access: 'PUBLIC', allowed: [] },
  { method: 'GET', path: '/vote/results', access: 'PUBLIC', allowed: [] },
  { method: 'GET', path: '/vote/results/latest', access: 'PUBLIC', allowed: [] },
  { method: 'GET', path: '/voting-config', access: 'ROLES', allowed: [RoleCode.SUPER_ADMIN] },
  { method: 'PATCH', path: '/voting-config', access: 'ROLES', allowed: [RoleCode.SUPER_ADMIN] }
]
