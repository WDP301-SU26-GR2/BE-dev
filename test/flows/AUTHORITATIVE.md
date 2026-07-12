# AUTHORITATIVE DATA (cho subagent viết flow test)

> File này là "single source of truth" — đã verify từ BE source code trước khi phase implementer bắt đầu.
> Khi subagent có câu hỏi về schema/model/enum/error code/transition, **đọc file này trước**. Nếu thiếu → đọc trực tiếp source (paths absolute bên dưới).

---

## 0. Repo + server + tools

- Repo gốc: `D:\FPT\semester-8\WDP\BE-dev`
- Server flowtest đang chạy background: `pid=47072`, port **4100**, MongoDB replicaSet `rs0`, Redis `:6379`
- `.env.flowtest` (gitignored) — `DATABASE_URL=mongodb://localhost:27017/Mangaka-flowtest?replicaSet=rs0` `PORT=4100` `AI_SERVICE_URL=` (rỗng = AI tắt)
- Admin: `admin@ecom.dev.com` / `admin@123123` / `+849399212721`
- Test framework:
  - `pnpm flowtest` = run-all (chạy tất cả file theo thứ tự)
  - `pnpm flowtest:one test/flows/<file>.ts` = chạy 1 file
  - Helper libs (đọc source trước):
    - `test/flows/lib/env.ts` — exports `{ DATABASE_URL, API }`, có guard chặn DB không chứa 'flowtest' (exit 2)
    - `test/flows/lib/http.ts` — `req(method, path, { token?, body?, xff?, headers? })`, `ok(name, cond, extra)`, `expectError(res, status, code, name)`, `section(name)`, `summary(file)`, `finding(name, note)`, `sleep(ms)`
    - `test/flows/lib/seed.ts` — `wipeDb()`, `seedRolesAndAdmin()`, `makeUser(roleCode, over?)`, `makeSeriesAt(status, { mangakaId, editorId?, ... })`, `makeContractAt(status, { seriesId, mangakaId, editorId?, ... })`, `makeChapterAt({ seriesId, chapterNumber, nameId?, manuscriptStatus?, publishedAt? })`, `makeNameAt({ seriesId, chapterId?, kind?, status?, version? })`, `makePageAt({ chapterId, pageNumber, status? })`, `makeTaskAt({ pageId, regionId?, assistantId, status?, priority?, deadline? })`, `makeStudioAssignment({ mangakaId, assistantId, seriesId?, status?, ... })`, `makeBoardSession({ creatorId, allowedEditorIds, status?, startTime?, endTime?, title? })`, `makeBoardDecision({ sessionId, decisionType, targetSeriesId?, result?, allowedEditorIds?, endingChapterAllowance?, details? })`, `makeSurveyPeriod({ createdBy?, issueNumber?, status?, startDate?, endDate? })`, `makeRankingRecords(periodId, rows[])`, `makePaymentCondition({ contractId, conditionType, payoutAmount?, payoutPct?, isRecurring?, thresholdConfig?, status? })`, `makeDeadlineRequest(...)`, `seedOtp(email, purpose)`, `setAppConfig(patch)`, `setVotingConfig(patch)`, `setBoardConfig(patch)`
    - `test/flows/lib/auth.ts` — `login(email, pw?) → accessToken` (cache per email), `seedOtp(email, purpose)` (alias), `clearTokenCache()`, `expectError(...)` (throw version)
    - `test/flows/lib/ws.ts` — `connectBoard(token?)` → socket, `waitConnected(sock, ms?) → {connected, error?}`, `joinSession(sock, sessionId, ms?) → { status: 'SUCCESS'|'DENIED', message? }`, `waitForEvent(sock, event, ms?) → payload`
    - `test/flows/lib/cron.ts` — `withCronContext<R>(fn: (ctx) => Promise<R>) → R` — boots `dist/app.module.js` không listen HTTP, stops mọi cron tick, trả `ctx.get<T>(class)` + `ctx.close()`

---

## 1. Các enums cần biết (lấy từ `@prisma/client`)

```ts
import { RoleCode, UserStatus, RegistrationType, OtpPurpose,
  SeriesStatus, ProposalStatus, ChapterStatus, ManuscriptStatus, PageStatus,
  NameStatus, NameKind, TaskStatus,
  ContractStatus, ContractType, ConditionType, PaymentConditionStatus, PaymentRecordStatus, PaymentType, PaymentSource,
  ContractAmendmentStatus, AmendmentTrigger,
  ReprintRequestStatus, ReprintRevisionMode, ReviserType, ReprintChapterStatus,
  TransferRequestStatus, TransferType, TransferContractStatus,
  DeadlineRequestStatus, BoardSessionStatus, BoardDecisionResult, DecisionType, VoteValue,
  PublicationType, RelationshipType, FranchiseConsentStatus,
  SurveyStatus, RiskLevel, ReaderAuthMethod, VotingAuthMode, AuditEntityType,
  CoOwnerApprovalStatus, AnnotationType, AnnotationTargetType, ReviewStage,
  AssetType, NotificationType, AvailabilityStatus, Specialization,
  AiJobStatus, AiJobType, CollaborationInviteStatus, StudioAssignmentStatus,
  Genre, Demographic, ConditionGuard } from '@prisma/client'
```

Đặc biệt giá trị thường gặp:
- `RoleCode.MANGAKA | ASSISTANT | EDITOR | BOARD_MEMBER | SUPER_ADMIN`
- `UserStatus.ACTIVE | INACTIVE | BANNED | BLOCKED`
- `RegistrationType.SELF_REGISTERED | ADMIN_CREATED`
- `OtpPurpose.REGISTER | FORGOT_PASSWORD | SIGNING_CONTRACT | VOTE`
- `SeriesStatus.DRAFT | IN_REVIEW | READY_TO_PITCH | PITCHED | SERIALIZED | HIATUS | COMPLETING | CANCELLING | COMPLETED | CANCELLED | REJECTED | ABANDONED | WITHDRAWN`
- `ManuscriptStatus.DRAFT | IN_PRODUCTION | COMPOSITE_REVIEW | EDITOR_REVIEW | EDITOR_REVISION | READY_FOR_PRINT | AWAITING_CO_OWNER_APPROVAL | PUBLISHED`
- `PageStatus.NOT_STARTED | IN_PROGRESS | COMPOSITE_READY | COMPLETED`
- `ContractType.FULL_BUYOUT | REVENUE_SHARE`
- `ContractStatus.DRAFT | MANGAKA_REVIEW | MANGAKA_APPROVED | BOARD_APPROVED | NEGOTIATION | MANGAKA_SIGNED | FULLY_EXECUTED | FULFILLED | TERMINATED | TERMINATED_BY_BREACH | EXPIRED | VOIDED`
- `DeadlineRequestStatus.PROPOSED | COUNTER_PROPOSED | AGREED_BY_PARTIES | BOARD_REVIEW | ESCALATED | APPROVED | REJECTED`
- `ReprintRequestStatus.PENDING | MANGAKA_APPROVED | BOARD_APPROVED | PROPOSED | MANGAKA_REVIEW | IN_PRODUCTION | APPROVED | PUBLISHED | REJECTED | REJECTED_BY_MANGAKA`
- `TransferRequestStatus.SUBMITTED | UNDER_REVIEW | REJECTED_BY_BOARD | NEGOTIATING | REJECTED_BY_ORIGINAL_MANGAKA | PROPOSED | ACCEPTED | REJECTED | CANCELLED`
- `TransferContractStatus.DRAFT | A_SIGNED | B_SIGNED | BOARD_SIGNED | FULLY_EXECUTED | VOIDED`
- `BoardSessionStatus.UPCOMING | ACTIVE | CONCLUDED`
- `BoardDecisionResult.PENDING | PENDING_QUORUM | APPROVED | REJECTED | EXPIRED`
- `DecisionType.CONTINUE | CANCEL | HIATUS | ENDING_ALLOWANCE | SERIES_CONTRACT_APPROVAL | SERIALIZATION | CANCELLATION | FORMAT_CHANGE | COMPLETION | REPRINT | TRANSFER | CONTRACT`
- `SurveyStatus.DRAFT | OPEN | CLOSED | REFLECTED`
- `RiskLevel.NONE | LOW | MEDIUM | SEVERE`
- `VotingAuthMode.OTP | CAPTCHA | HYBRID`
- `NameKind.PROPOSAL | CHAPTER`
- `NameStatus.DRAFT | SUBMITTED | IN_REVIEW | REVISION | APPROVED`
- `PublicationType.WEEKLY | MONTHLY | IRREGULAR`

---

## 2. State machine transitions

```
SERIES: DRAFT→{IN_REVIEW, WITHDRAWN}; IN_REVIEW→{READY_TO_PITCH, ABANDONED, WITHDRAWN};
        READY_TO_PITCH→{PITCHED, WITHDRAWN}; PITCHED→{SERIALIZED, REJECTED};
        SERIALIZED→{HIATUS, COMPLETING, CANCELLING}; HIATUS→{SERIALIZED, COMPLETING, CANCELLING};
        COMPLETING→{COMPLETED}; CANCELLING→{CANCELLED}; *→{}
        File: src/modules/series/series.constant.ts (SERIES_TRANSITIONS)

MANUSCRIPT: DRAFT→IN_PRODUCTION→COMPOSITE_REVIEW→EDITOR_REVIEW
            →{EDITOR_REVISION, READY_FOR_PRINT}; EDITOR_REVISION→EDITOR_REVIEW
            READY_FOR_PRINT→{PUBLISHED, AWAITING_CO_OWNER_APPROVAL}
            AWAITING_CO_OWNER_APPROVAL→{PUBLISHED, EDITOR_REVISION}
            File: src/modules/chapter/chapter.constant.ts

PAGE: NOT_STARTED→IN_PROGRESS→COMPOSITE_READY→{COMPLETED, IN_PROGRESS}; *→{}

TASK: ASSIGNED→{IN_PROGRESS, ON_HOLD, CANCELLED}
      IN_PROGRESS→{SUBMITTED, ON_HOLD, ASSIGNED, CANCELLED}
      SUBMITTED→{UNDER_REVIEW, ON_HOLD, CANCELLED}
      UNDER_REVIEW→{APPROVED, REVISION_REQUESTED, ON_HOLD, CANCELLED}
      REVISION_REQUESTED→{IN_PROGRESS, SUBMITTED, ON_HOLD, ASSIGNED, CANCELLED}
      *→{}
      File: src/modules/task/task.constant.ts

CONTRACT: DRAFT→MANGAKA_REVIEW→{MANGAKA_APPROVED, NEGOTIATION}→BOARD_APPROVED→{MANGAKA_SIGNED, FULLY_EXECUTED, NEGOTIATION}
          MANGAKA_SIGNED→FULLY_EXECUTED→{FULFILLED, TERMINATED, TERMINATED_BY_BREACH, EXPIRED}
          *→{}
          Signable: [BOARD_APPROVED, MANGAKA_SIGNED]; Editable: [MANGAKA_REVIEW, MANGAKA_APPROVED, BOARD_APPROVED, NEGOTIATION]

DEADLINE_REQUEST: PROPOSED↔COUNTER_PROPOSED↔AGREED_BY_PARTIES↔BOARD_REVIEW↔ESCALATED↔{APPROVED, REJECTED}
                  Closed=APPROVED|REJECTED; Resolved=Closed+ESCALATED+BOARD_REVIEW

REPRINT_REQUEST: PENDING→{MANGAKA_REVIEW, MANGAKA_APPROVED, BOARD_APPROVED, REJECTED, REJECTED_BY_MANGAKA}
                 PROPOSED→{...}; MANGAKA_REVIEW→{MANGAKA_APPROVED, REJECTED_BY_MANGAKA, BOARD_APPROVED}
                 MANGAKA_APPROVED→BOARD_APPROVED→{IN_PRODUCTION, PUBLISHED, REJECTED}
                 IN_PRODUCTION→{APPROVED, REJECTED}; APPROVED→PUBLISHED; *→{}
                 File: src/modules/reprint/services/reprint-request-state.service.ts

BOARD_SESSION: UPCOMING→ACTIVE→CONCLUDED (terminal)
               File: src/modules/board/services/board-session-state.service.ts

NAME: DRAFT→SUBMITTED→IN_REVIEW→APPROVED; IN_REVIEW→REVISION→IN_REVIEW (loop)
      updatePages/addPage: DRAFT|REVISION only
      createChapterName: chapter.status==DRAFT required
```

---

## 3. Error codes (240+ entries — đã verify file messages.ts)

Chi tiết xem source: `<module>/<module>.messages.ts` hoặc `<module>/errors/<module>.errors.ts`.
Đường dẫn đã verify:
- `src/modules/auth/auth.messages.ts` + `auth.errors.ts`
- `src/modules/users/users.messages.ts` + `errors/users.errors.ts`
- `src/modules/series/series.messages.ts` + `errors/series.errors.ts`
- `src/modules/name/name.messages.ts` + `errors/name.errors.ts`
- `src/modules/chapter/chapter.messages.ts` + `errors/chapter.errors.ts`
- `src/modules/task/task.messages.ts` + `errors/task.errors.ts`
- `src/modules/contract/contract.messages.ts` + `errors/contract.errors.ts`
- `src/modules/payment/errors/payment.error.ts` (raw SCREAMING_SNAKE)
- `src/modules/board/board.messages.ts` + `errors/board.errors.ts`
- `src/modules/survey/survey.messages.ts` + `errors/survey.errors.ts`
- `src/modules/reprint/reprint-request.messages.ts` + `errors/reprint-request.error.ts`
- `src/modules/transfer/errors/transfer.message.ts` (raw)
- `src/modules/deadline/deadline.messages.ts` + `errors/deadline.errors.ts`
- `src/modules/studio/studio.messages.ts` + `errors/studio.errors.ts`
- `src/modules/reviews/reviews.messages.ts` + `errors/reviews.errors.ts`
- `src/modules/storage/storage.messages.ts` + `errors/storage.errors.ts`
- `src/modules/annotation/annotation.messages.ts` + `errors/annotation.errors.ts`
- `src/modules/ai/ai.messages.ts` + `errors/ai.errors.ts`
- `src/modules/audit/audit.messages.ts`
- `src/modules/app-config/app-config.messages.ts`
- `src/modules/publication/publication.messages.ts` + `errors/publication.errors.ts`
- `src/modules/tankobon/tankobon.messages.ts` + `errors/tankobon.errors.ts`
- `src/modules/notification/notification.messages.ts` + `errors/notification.errors.ts`
- `src/core/http/http.messages.ts`
- `src/core/security/security.messages.ts`
- `src/core/security/errors/rate-limit.errors.ts`

Frequency table (chi tiết đầy đủ trong source):
- `Error.SeriesNotFound, Error.NotSeriesOwner, Error.ProposalNotEditable, Error.InvalidSeriesTransition, Error.SeriesNotReadyToPitch`
- `Error.ChapterNotFound, Error.NotSeriesEditor, Error.InvalidManuscriptTransition, Error.InvalidPageTransition, Error.PagesNotAllCompleted, Error.DuplicateChapterNumber, Error.NameNotApproved, Error.ContractNotExecuted, Error.ChapterNotHoldable, Error.ChapterAlreadyOnHold, Error.ChapterNotOnHold, Error.EndingAllowanceExceeded, Error.ChapterNumberLocked`
- `Error.TaskNotFound, Error.NotTaskAssignee, Error.AssistantNotHired, Error.AssetNotFound, Error.TaskNotReassignable, Error.TaskNotCancellable, Error.RegionHasApprovedTasks, Error.ChapterOnHold, Error.InvalidTaskTransition`
- `Error.ContractNotFound, Error.ContractNotSignableYet, Error.InvalidContractTransition, CONTRACT_NOT_FOUND, Error.AmendmentNotFound, Error.AmendmentNotVoidable`
- `PAYMENT_RECORD_NOT_FOUND, INVALID_STATUS_FOR_PAYMENT_EXPECTED_APPROVED, PAYMENT_CONDITION_NOT_FOUND`
- `Error.ReprintRequestNotFound, Error.InvalidReprintTransition, Error.ReprintNotWithRevision`
- `TRANSFER_REQUEST_NOT_FOUND, TRANSFER_CONTRACT_NOT_FOUND, Error.InvalidTransferState`
- `Error.DeadlineRequestNotFound, Error.OpenDeadlineRequestExists, Error.InvalidDeadlineRequestTransition`
- `Error.BoardSessionNotFound, Error.BoardDecisionNotFound, Error.BoardSessionNotOpen, Error.VoterNotAllowed, Error.VoterAlreadyVoted`
- `Error.SurveyPeriodNotFound, Error.SurveyPeriodNotOpen, Error.ReaderAlreadyVoted, Error.VoteIpLimitExceeded, Error.TooManySeriesSelected`
- Rate-limit wrapper: `code: 'AUTH_OTP_RATE_LIMITED'` hoặc `'VOTE_OTP_RATE_LIMITED'` (trên `Error.OtpRateLimited` / `Error.VoteOtpRateLimit`)
- Common: `Error.InvalidOTP, Error.OTPExpired, Error.OTPLocked, Error.FailedToSendOTP, Error.EmailAlreadyExists, Error.EmailNotFound, Error.EmailAlreadyVerified, Error.EmailNotVerified, Error.InvalidPassword, Error.RefreshTokenAlreadyUsed, Error.UnauthorizedAccess, Error.AccountBanned`
- Validation 422: `message: "Validation failed"`, các field error `errors: [{message, path}]` — không phải `Error.*`, là raw string.
- 500: `message: "Internal server error"` (raw)

---

## 4. Một số endpoint paths thực tế (đã verify với running server)

```
POST /auth/register            body: { email, password, confirm_password, name, displayName, phoneNumber, type: 'MANGAKA'|'ASSISTANT' }
POST /auth/login               body: { email, password }
POST /auth/verify-email        body: { email, code }     → 201 Created (không phải 200!)
POST /auth/send-otp            body: { email, purpose }  → rate-limit trả 429 AUTH_OTP_RATE_LIMITED
POST /auth/forgot-password     body: { email, code, newPassword, confirmNewPassword }
POST /auth/change-password     body: { currentPassword, newPassword, confirmNewPassword }
POST /auth/refresh-token       body: { refreshToken }
POST /auth/logout              body: { refreshToken }

# Admin (super-admin only)
POST   /admin/users                        body: { email, password, confirm_password?, name, displayName, phoneNumber, role: 'EDITOR'|'BOARD_MEMBER' }
GET    /admin/users
GET    /admin/users/:id
PATCH  /admin/users/:id/status             body: { status }
DELETE /admin/users/:id
POST   /admin/users/:id/restore
POST   /admin/users/:id/reset-password
GET    /admin/stats

# Series
POST   /series                              body: { title, genres, demographic?, publicationType?, synopsis?, ... }
GET    /series?...
GET    /series/:id
PATCH  /series/:id                          update trong khi status DRAFT/IN_REVIEW
DELETE /series/:id                          chỉ khi DRAFT
POST   /series/:id/submit                   transition sang IN_REVIEW
POST   /series/:id/start-review             Editor set reviewStartedAt
POST   /series/:id/pitch                    Editor → READY_TO_PITCH
POST   /series/:id/serialize                Board → SERIALIZED (thường qua board decision)
POST   /series/:id/hold                     → HIATUS
POST   /series/:id/resume                   → SERIALIZED
POST   /series/:id/start-completion         → COMPLETING (Board decision COMPLETION)
POST   /series/:id/finalize-completion      → COMPLETED
POST   /series/:id/start-cancelling         → CANCELLING (set endingChapterAllowance + chapterCountAtCancelling)
POST   /series/:id/withdraw                 DRAFT/IN_REVIEW/READY_TO_PITCH → WITHDRAWN
POST   /series/:id/abandon                  IN_REVIEW → ABANDONED
POST   /series/:id/reject                   Editor: READY_TO_PITCH → REJECTED
POST   /series/:id/propose-franchise        set franchiseConsentStatus
POST   /series/:id/franchise-consent        approve/reject consent
POST   /series/:id/co-owner                 set coOwnerId

# Proposal (embedded) — name related
POST   /series/:seriesId/name-proposals
GET    /series/:seriesId/name-proposals
POST   /name-proposals/:id/submit           PROPOSAL_DRAFT → SUBMITTED
POST   /name-proposals/:id/review           → PROPOSAL_REVISION / APPROVED / REJECTED
POST   /name-proposals/:id/resubmit         REVISION → SUBMITTED (version+1)
POST   /name-proposals/:id/pages
POST   /name-proposals/:id/request-revision → REVISION
POST   /name-proposals/:id/approve          → APPROVED
POST   /name-proposals/:id/reject           → REJECTED

# Name (chapter) — chapter-scoped (Spec 12 tách vai; chapter-Name là tài nguyên của CHAPTER, không phải SERIES)
POST   /chapters/:id/names                        create chapter-Name (kind=CHAPTER) — chapter DRAFT only
GET    /chapters/:id/names                        list Name của chapter (0..1)
GET    /chapters/:id/names/:nameId                chi tiết chapter-Name
POST   /chapters/:id/names/:nameId/request-revision → REVISION
POST   /chapters/:id/names/:nameId/resubmit       REVISION → IN_REVIEW, version++
POST   /chapters/:id/names/:nameId/approve        → APPROVED
PUT    /chapters/:id/names/:nameId/pages          thay TOÀN BỘ pages (DRAFT/REVISION only)
POST   /chapters/:id/names/:nameId/pages          thêm 1 page (DRAFT/REVISION only)
DELETE /chapters/:id/names/:nameId                xoá chapter-Name (chapter DRAFT + Name chưa APPROVED) → 200 { message }

# Name (proposal) — series-scoped, **PROPOSAL-ONLY** (Spec 12)
# Truy cập chapter-Name qua các route dưới đây → 404 Error.NameNotFound (bằng chứng tách vai).
GET    /series/:id/names                          list proposal-Name (CHỈ kind=PROPOSAL; query không có filter kind — strict reject mọi field lạ → 422)
GET    /series/:id/names/:nameId                  chi tiết proposal-Name
POST   /series/:id/names/:nameId/request-revision → REVISION
POST   /series/:id/names/:nameId/resubmit         REVISION → IN_REVIEW, version++
POST   /series/:id/names/:nameId/approve          → APPROVED (emit NameApproved → Series READY_TO_PITCH nếu kind=PROPOSAL)
PUT    /series/:id/names/:nameId/pages            thay TOÀN BỘ pages (DRAFT/REVISION only)
POST   /series/:id/names/:nameId/pages            thêm 1 page (DRAFT/REVISION only)

# Self-service identity (Spec 12 Part A)
GET    /me                                        thông tin tài khoản của chính mình (mọi role; KHÔNG password)
PATCH  /me                                        body: { name?, displayName?, avatar?, phoneNumber? }
                                                    '' = clear sentinel; null/omit = giữ nguyên
                                                    strict reject email/role/status → 422

# StaffProfile CRUD — Editor/Board (Spec 12 Part B)
PUT    /me/staff-profile                          body: { specialtyGenres?, demographics?, bio?, yearsOfExperience? } — EDITOR/BOARD only
GET    /me/staff-profile                          xem staff profile của mình (EDITOR/BOARD)
GET    /staff/:userId                             xem công khai staff profile (ẩn email/phone); hasProfile=false nếu chưa build

# Board auto-roster (PB-05)
GET    /board/suggest-members?seriesId=           gợi ý roster Board theo thể loại series; items[].score giảm dần, size lẻ >= 3 — EDITOR/SUPER_ADMIN only

# Chapters
POST   /series/:seriesId/chapters           body: { chapterNumber, title?, nameId? }
GET    /series/:seriesId/chapters
GET    /chapters/:id
PATCH  /chapters/:id
DELETE /chapters/:id                        chỉ khi DRAFT, nameId=null
POST   /chapters/:id/start-composite
POST   /chapters/:id/editor-review
POST   /chapters/:id/submit-editor-revision
POST   /chapters/:id/ready-for-print
POST   /chapters/:id/awaiting-co-owner
POST   /chapters/:id/co-owner-approve
POST   /chapters/:id/co-owner-reject        body: { reason }
POST   /chapters/:id/hold                   body: { reason, expectedReturnDate? }
POST   /chapters/:id/resume

# Pages
POST   /chapters/:chapterId/pages
GET    /chapters/:chapterId/pages
PATCH  /pages/:id
POST   /pages/:id/start
POST   /pages/:id/composite-ready

# Tasks
POST   /pages/:pageId/tasks
GET    /tasks/:id
PATCH  /tasks/:id
POST   /tasks/:id/assign-assistant          body: { assistantId }
POST   /tasks/:id/reassign                  body: { assistantId }
POST   /tasks/:id/start                     → IN_PROGRESS
POST   /tasks/:id/submit                    → SUBMITTED
POST   /tasks/:id/revision-requested
POST   /tasks/:id/approve                   → APPROVED
POST   /tasks/:id/cancel                    → CANCELLED
POST   /tasks/:id/hold
POST   /tasks/:id/resume

# Assets (R2 keys only — direct upload via storage controller)
POST   /storage/upload                      body multipart; returns { key, url }
POST   /storage/presign                     body: { contentType, fileName, size? } → { key, presignedUrl }

# Studio (assistant collaborations)
POST   /studio/invites
GET    /studio/invites/:id
POST   /studio/invites/:id/accept
POST   /studio/invites/:id/decline
POST   /studio/invites/:id/cancel
GET    /studio/assignments
GET    /studio/assignments/:id
POST   /studio/assignments/:id/terminate    body: { reason }
POST   /studio/reviews                      body: { assistantId, rating, comment? }
PATCH  /studio/reviews/:id

# Contract
POST   /contracts                           body: { seriesId, contractType, ... }
GET    /contracts/:id
PATCH  /contracts/:id                       Editable state
POST   /contracts/:id/versions
GET    /contracts/:id/versions
POST   /contracts/:id/submit-mangaka-review → MANGAKA_REVIEW
POST   /contracts/:id/approve-mangaka       → MANGAKA_APPROVED
POST   /contracts/:id/start-negotiation      → NEGOTIATION
POST   /contracts/:id/board-approve          → BOARD_APPROVED
POST   /contracts/:id/board-reject          → loại
POST   /contracts/:id/sign-mangaka          → MANGAKA_SIGNED
POST   /contracts/:id/signatures            list signatures
POST   /contracts/:id/sign                  → FULLY_EXECUTED
POST   /contracts/:id/terminate             body: { reason }
POST   /contracts/:id/amendments
PATCH  /contracts/amendments/:id
POST   /contracts/amendments/:id/sign
POST   /contracts/amendments/:id/void
POST   /contracts/conditions                tạo PaymentCondition
PATCH  /contracts/conditions/:id
POST   /contracts/conditions/:id/enable
POST   /contracts/conditions/:id/disable

# Payment
POST   /payments                            tạo PaymentRecord (TRIGGERED)
GET    /payments/:id
POST   /payments/:id/approve                 → APPROVED
POST   /payments/:id/pay                    body: { paymentMethod, transactionReference } → PAID
POST   /payments/:id/cancel                  body: { cancelReason } (TRIGGERED|PENDING|APPROVED only)
GET    /payments/contract/:contractId

# Survey / voting
GET    /voting/config
PATCH  /voting/config                       admin
POST   /survey/periods
GET    /survey/periods
GET    /survey/periods/:id
POST   /survey/periods/:id/open
POST   /survey/periods/:id/close
POST   /survey/periods/:id/finalize         → REFLECTED (kèm ranking computed)
POST   /survey/periods/:id/import-external  body: { entries: [{seriesId, voteCount}] }
POST   /survey/periods/:id/vote             reader email+phone+captcha, OTP or captcha

# Reader voting
POST   /reader-votes/send-otp               body: { identity }    → purpose VOTE
POST   /reader-votes/cast                   body: { identity, otp?, captcha?, seriesIds: string[] }

# Ranking
GET    /ranking/periods/:id/series
GET    /ranking/series/:seriesId/history
GET    /ranking/periods/:id/risks           thấp/SEVERE

# Board
POST   /board/sessions
GET    /board/sessions
GET    /board/sessions/:id
PATCH  /board/sessions/:id
POST   /board/sessions/:id/start            UPCOMING → ACTIVE (chỉ creator)
POST   /board/sessions/:id/conclude         ACTIVE → CONCLUDED (chỉ creator)
POST   /board/decisions                     body: { sessionId, decisionType, targetSeriesId?, endingChapterAllowance?, details? }
GET    /board/decisions/:id
POST   /board/decisions/:id/vote            body: { voteValue: 'APPROVE'|'REJECT'|'ABSTAIN', note? }
POST   /board/decisions/:id/conclude        → APPROVED|REJECTED|EXPIRED
POST   /board/decisions/:id/report          body: { content, attachments? }
GET    /board/decisions/:id/report

# Reprint
POST   /reprint-requests
GET    /reprint-requests
GET    /reprint-requests/:id
GET    /reprint-requests/:id/chapters
GET    /reprint-requests/:id/chapters/:chapterId
PATCH  /reprint-requests/:id/chapters/:chapterId/manuscript
PATCH  /reprint-requests/:id/chapters/:chapterId/approve
PATCH  /reprint-requests                    (admin cancel)
PATCH  /reprint-requests/:id/mangaka-review
PATCH  /reprint-requests/:id/board-approve
PATCH  /reprint-requests/:id/chapters/:chapterId/assign-reviser

# Transfer
POST   /transfers/requests                  body: { seriesId, originalMangakaId, requestingMangakaId, proposedType, proposedPercentage?, planDescription? }
GET    /transfers/requests/mine
GET    /transfers/requests/pending-board
GET    /transfers/requests/:id
POST   /transfers/requests/:id/board-approve
POST   /transfers/requests/:id/board-reject
POST   /transfers/requests/:id/assign-full-buyout
POST   /transfers/requests/:id/start-negotiation
POST   /transfers/requests/:id/mangaka-accept
POST   /transfers/requests/:id/mangaka-reject
POST   /transfers/contracts                 body: { transferRequestId, ... }
POST   /transfers/contracts/:id/sign
GET    /transfers/contracts/:id/signatures

# Deadline
POST   /deadline-requests
GET    /deadline-requests
GET    /deadline-requests/:id
POST   /deadline-requests/:id/counter       → COUNTER_PROPOSED
POST   /deadline-requests/:id/agree         → AGREED_BY_PARTIES (parties)
POST   /deadline-requests/:id/board-resolve
POST   /deadline-requests/:id/withdraw
POST   /deadline-requests/:id/reject
POST   /deadline-requests/:id/finalize      → APPROVED (sau AGREED + board approve)

# Publication / Tankobon / AI / Audit / Notifications — xem controller

# WS
namespace /board
events: 'joinSession' (ack), 'voteProgressUpdated' (broadcast), 'sessionClosed' (broadcast)
```

> Lưu ý: route CUỐI CÙNG — verify trước khi dùng:
> - `curl http://localhost:4100/api-json | jq '.paths | keys'`

---

## 5. Business rules & gotchas

- **Naming convention:** Prisma @default(auto()) ObjectId fields, không truyền `id` lúc create. Embedded types (`proposal`, `completionProposal`, `statusHistory[]`, ...) set inline qua parent create/update.
- **State single-writer:** mỗi state transition chỉ service tương ứng mới được set. Test KHÔNG ghi đè status trực tiếp ngoài chỗ service-allowed (trừ fast-forward factory).
- **ObjectId guard:** server validate ObjectId mọi path-param. `aaaaaaaaaaaaaaaaaaaaaaaa` (24 hex) hợp lệ về format nhưng FK không tồn tại → throw NotFound.
- **OTP:** purpose REGISTER không tự xoá sau verify — service xoá `OtpRequest` ngay khi `activateUser`. `OtpRequest` tối đa 5 attempt (`AUTH_OTP_MAX_ATTEMPTS`); 429 cooldown 60s (`OTP_RL_COOLDOWN`).
- **mustChangePassword:** set true khi admin reset password → user phải change trước khi dùng app.
- **Multi-role:** SUPER_ADMIN có quyền cao nhất; `CannotModifyAdminUserException` không cho modify SUPER_ADMIN.
- **Dashboard stats:** `GET /admin/stats` trả aggregate (groupBy snapshot).
- **Audit log entity:** `AuditLog.entityType` enum cover hết module.
- **Rate-limit IP HMAC:** `'203.0.113.50'` (RFC 5737 reserved) là IP an toàn cho test. Mọi request test đặt `xff: '203.0.113.50'` qua lib/http.ts đã set mặc định.
- **AI tắt:** `AI_SERVICE_URL=''` (rỗng) → AI controller trả 503 + `Error.AiNotEnabled`.
- **Series SERIALIZED precondition:** sau khi transition `PITCHED→SERIALIZED`, magazine+startIssueNumber KHÔNG được thay đổi.
- **Cancelling allowance:** `chapterCountAtCancelling + 1 ≤ endingChapterAllowance` cho phép tạo chapter mới; vượt → 422 `Error.EndingAllowanceExceeded`.
- **Co-owner approval:** khi chapter có `coOwnerApprovalRequired`, READY_FOR_PRINT chuyển sang `AWAITING_CO_OWNER_APPROVAL` đợi co-owner quyết; escalate qua Board nếu quá hạn.
- **Contract manual flow:** Editor soạn draft → MANGAKA_REVIEW → MANGAKA_APPROVED → BOARD_APPROVED → MANGAKA_SIGNED → FULLY_EXECUTED. Mỗi transition có guard đúng actor.
- **RBAC decorated via `@Auth(...)`:** test phụ thuộc spec matrix §19 để biết role nào được route nào.

---

## 6. Cấu trúc file flow test — pattern BẮT BUỘC

```ts
import { wipeDb, seedRolesAndAdmin, prisma, makeUser, makeSeriesAt, ... } from './lib/seed.js'
import { req, ok, section, summary, expectError, resetCounters, sleep } from './lib/http.js'
import { login } from './lib/auth.js'
import { SeriesStatus, ... } from '@prisma/client'

const FLOW = 'flow-XX-name.ts'

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await wipeDb()
  await seedRolesAndAdmin()

  // SEED helpers cụ thể flow (vd makeContractScenarioAt, makeBoardWithVotes)

  const m1 = await makeUser('MANGAKA')
  const e1 = await makeUser('EDITOR')
  // ... seed các role cần

  // ─── Section 1: <case title> ──────────────────────────────────────
  section('XX.1 <title>')
  const r1 = await req('POST', '/some/path', { token: '...', body: {...} })
  expectError(r1, 422, 'Error.SomeCode', 'XX.1a name')
  ok('XX.1b other', r1.status === 201)

  // ─── Khi phát hiện bug: append FINDINGS.md + console finding() ────
  finding('XX.X some bug', 'mô tả ngắn')

  await prisma.$disconnect()
  const fail = summary(FLOW)
  process.exit(fail > 0 ? 1 : 0)
}

void main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
```

- **`resetCounters()` LẦN ĐẦU** trong main. Sau mỗi `summary()` exit. KHÔNG reset giữa chừng.
- Mỗi case dùng `ok(name, cond, extra?)` (lib/http.ts đã count pass/fail).
- Status code + error code dùng `expectError(r, status, 'Error.XYZ', name)`.
- Validation 422 KHÔNG dùng `Error.*` mà dùng literal `'Validation failed'`.
- Bug phát hiện: gọi `finding(name, note)` và append file `FINDINGS.md` với format đã có.
- KHÔNG đụng BE code (theo instruction). Tìm bug → report.

---

## 7. Khi test fail: playbook

1. Test fail `expect 4xx+Error.X got 5xx`:
   - Tail `server-flowtest.log`
   - Nếu `PrismaClientUnknownRequestError`, `BadRequestException`, `NotFoundException`, `HttpException` → có thể là state-machine guard throw đúng nhưng status code BE trả KHÔNG đúng spec (vd 500 thay vì 422). Ghi FINDING.
   - Nếu `Internal server error` chỉ thuần → nghi vấn bug. Ghi FINDING.
2. Test fail rate-limit 429 → tăng `sleep()` giữa các bước hoặc seed thẳng vào DB (factory pattern).
3. Test fail validation 422 với message khác `Error.*` → check Zod schema đó cho field exact.

---

## 8. Server đang chạy (verify trước khi bắt đầu)

```bash
curl -s http://localhost:4100/api-json | jq '.paths | keys' | head -50
```

Nếu không response → server down. Không tự restart — báo cáo cho cha.
