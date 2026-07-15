import { RoleCode } from '@prisma/client'
import { z } from 'zod'

type EnumLike = Record<string, string>

const valuesOf = <T extends EnumLike>(enumObject: T) => Object.values(enumObject) as [T[keyof T], ...T[keyof T][]]

export const ENUM_DOCS = {
  RoleCode: 'Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN',
  AuditEntityType:
    'Audited entity type: SERIES, MANUSCRIPT, PAGE, CHAPTER, TASK, DEADLINE_REQUEST, USER, REGION, APP_CONFIG, CONTRACT, BOARD_DECISION, REPRINT_REQUEST, TRANSFER_REQUEST',
  UserStatus: 'User lifecycle status: INACTIVE, ACTIVE, BANNED, BLOCKED',
  RegistrationType: 'How the account was created: SELF_REGISTERED or ADMIN_CREATED',
  OtpPurpose: 'OTP purpose: REGISTER, FORGOT_PASSWORD, SIGNING_CONTRACT',
  PublicationType: 'Publication cadence: WEEKLY, MONTHLY, IRREGULAR',
  RelationshipType: 'Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT',
  Genre: 'Manga genre (mảng, nhiều thể loại / series)',
  Demographic: 'Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO',
  AvailabilityStatus: 'Assistant availability: AVAILABLE, BUSY, ON_LEAVE, UNAVAILABLE',
  Specialization: 'Assistant specialization/task type',
  CollaborationInviteStatus: 'Trạng thái lời mời cộng tác: PENDING, ACCEPTED, DECLINED, EXPIRED, CANCELLED',
  StudioAssignmentStatus: 'Trạng thái hợp tác studio: ACTIVE, COMPLETED, TERMINATED',
  SeriesStatus: 'Series state machine status',
  ProposalStatus: 'Series proposal review status',
  NameStatus: 'Name/chapter-name review status',
  NameKind: 'Name storyboard kind: PROPOSAL (proposal chapter-sample) or CHAPTER (per-chapter storyboard)',
  ChapterStatus: 'Chapter production status',
  ManuscriptStatus: 'Manuscript production status',
  PageStatus: 'Page production status',
  AnnotationTargetType: 'Annotation target: PAGE, REGION, TASK, MANUSCRIPT, NAME',
  AnnotationType: 'Annotation type: TEXT, HIGHLIGHT, DRAWING',
  ReviewStage: 'Review stage: ASSISTANT, MANGAKA, EDITOR',
  AssetType: 'Uploaded asset type',
  NotificationType: 'Notification type: SYSTEM, CONTRACT, TASK, DEADLINE, SURVEY, BOARD, REVIEW',
  RevisionTargetType: 'Đối tượng của vòng yêu cầu sửa: PROPOSAL, NAME, MANUSCRIPT, TASK',
  AiJobType: 'AI job type: SEGMENT; COLOR/NUMBER are reserved for Spec 3',
  AiJobStatus: 'AI job lifecycle: QUEUED -> RUNNING -> SUCCEEDED | FAILED',
  AiSegmentMode: 'Segmentation mode: MODEL (YOLO deep learning) or HEURISTIC (OpenCV baseline)',
  WarningLevel: 'Deadline warning: NONE an toan, YELLOW nguy co, RED kho kip, CRITICAL qua han',
  DeadlineRequestStatus:
    'Deadline negotiation status: PROPOSED, COUNTER_PROPOSED, AGREED_BY_PARTIES, APPROVED, REJECTED, ESCALATED, BOARD_REVIEW',
  ReadingDirection: 'Reading direction: RTL (right-to-left, manga gốc) | LTR (left-to-right, bản dịch phương Tây)',
  TaskStatus:
    'Task production status: ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED/REVISION_REQUESTED; ON_HOLD khi assistant nghỉ',
  RegionType: 'Loại vùng trên trang: PANEL, BACKGROUND, SPEECH_BUBBLE, SFX, CHARACTER',
  TaskVersionReviewStatus: 'Trạng thái review của 1 bản nộp task: PENDING, APPROVED, REVISION_REQUESTED',
  // Spec 5 — at-risk tiering (B-VOT-05 / PB-02)
  RiskLevel:
    'Mức nguy cơ của series theo kết quả ranking kỳ: NONE bình thường, LOW at-risk kỳ này, MEDIUM 3+ kỳ liên tiếp, SEVERE 5+ kỳ liên tiếp (feed Board)',
  // Spec 9 — PB-07: Loại reviser được gán cho chapter tái bản
  ReviserType: 'Loại reviser: INTERNAL_TEAM (team nội bộ) hoặc OTHER_MANGAKA (mangaka khác)',
  // Spec 9 — Part 4: Reprint lifecycle + embedded chapter status + revision mode (B-RPT-* / PB-07)
  ReprintRequestStatus:
    'Reprint request lifecycle: PENDING, PROPOSED, MANGAKA_REVIEW, MANGAKA_APPROVED, BOARD_APPROVED, APPROVED, PUBLISHED, REJECTED, REJECTED_BY_MANGAKA',
  ReprintChapterStatus: 'Reprint chapter status: PENDING, READY, IN_REVISION, APPROVED, REJECTED',
  ReprintRevisionMode: 'Reprint revision mode: AS_IS (giữ nguyên) hoặc WITH_REVISION (được sửa)',
  // Spec 9 — Part 5: Board convention (DecisionType + BoardSessionStatus)
  DecisionType:
    'Board decision type: CONTINUE, CANCEL, HIATUS, ENDING_ALLOWANCE, SERIES_CONTRACT_APPROVAL, SERIALIZATION, CANCELLATION, FORMAT_CHANGE, COMPLETION, REPRINT, TRANSFER, CONTRACT, OTHER',
  BoardSessionStatus: 'Board session status: UPCOMING (chờ tới giờ), ACTIVE (đang họp/vote), CONCLUDED (đã bế mạc)',
  ContractType:
    'Loại hợp đồng: FULL_BUYOUT (NXB mua đứt 100%, toàn quyền) | REVENUE_SHARE (ăn chia %, quyết định lớn cần Mangaka đồng ý) — BR-CONTRACT-03',
  ContractStatus:
    'Vòng đời hợp đồng: DRAFT → MANGAKA_REVIEW → MANGAKA_APPROVED → BOARD_APPROVED → NEGOTIATION → MANGAKA_SIGNED → FULLY_EXECUTED (khoá); kết thúc: FULFILLED | TERMINATED | TERMINATED_BY_BREACH | EXPIRED | VOIDED',
  ContractAmendmentStatus:
    'Vòng đời phụ lục hợp đồng: DRAFT → PENDING_SIGNATURES → FULLY_EXECUTED | VOIDED (reject → về DRAFT)',
  AmendmentTrigger:
    'Nguồn phát sinh phụ lục: MANUAL (Editor tự tạo) | FORMAT_CHANGE | COMPLETION (từ quyết định Flow 5 — BR-CONTRACT-06)',
  PaymentType:
    'Loại khoản chi cho Mangaka: CONDITION_PAYOUT (đạt điều kiện) | REVENUE_SHARE (chia lợi nhuận định kỳ) | COMPENSATION (đền bù khi huỷ series) | CHAPTER_MILESTONE | RECURRING_CHAPTER | RANKING_MILESTONE | TIME_BOUND (các payout theo điều kiện) | TRANSFER (liên quan chuyển nhượng)',
  PaymentSource:
    'Nguồn phát sinh khoản chi: CONTRACT (hợp đồng gốc) | REPRINT (tái bản) | TRANSFER (chuyển nhượng) | TERMINATION (huỷ/kết thúc hợp đồng) | MANUAL (tạo thủ công)',
  PaymentConditionStatus:
    'Trạng thái điều kiện giải ngân: PENDING (chờ đạt) | ACHIEVED (đã đạt) | PAID (đã chi) | CANCELLED (đã huỷ) | MISSED (hết hạn không đạt) | DISABLED (tạm dừng khi series HIATUS — BR-CONTRACT-07)',
  PaymentRecordStatus:
    'Trạng thái khoản chi: TRIGGERED (điều kiện đạt) | PENDING (chờ xử lý) → APPROVED (Board duyệt) → PAID (đã trả); MISSED/FAILED/CANCELLED = không chi trả',
  TransferType:
    'Kiểu chuyển nhượng (chỉ có nghĩa khi HĐ gốc REVENUE_SHARE): FULL_TRANSFER (B mua trọn phần của A, A ra đi) | PARTIAL_TRANSFER (A giữ lại một phần → A thành co-owner, duyệt mỗi chapter mới — BR-TRANSFER-03)',
  TransferRequestStatus:
    'Vòng đời yêu cầu chuyển nhượng: SUBMITTED → UNDER_REVIEW → NEGOTIATING/PROPOSED → ACCEPTED; nhánh từ chối/hủy: REJECTED_BY_BOARD | REJECTED_BY_ORIGINAL_MANGAKA | REJECTED | CANCELLED',
  TransferContractStatus:
    'Vòng đời hợp đồng chuyển nhượng 3 bên: DRAFT → A_SIGNED → B_SIGNED → BOARD_SIGNED → FULLY_EXECUTED | VOIDED',
  SurveyStatus:
    'Vòng đời kỳ bình chọn: DRAFT → OPEN (đang nhận phiếu) → CLOSED → REFLECTED (đã chốt ranking, công khai được)',
  BoardDecisionResult:
    'Kết quả quyết định Hội đồng: PENDING (đang bỏ phiếu), PENDING_QUORUM (chưa đủ quorum), APPROVED (thông qua), REJECTED (bác bỏ), EXPIRED (phiên đóng khi chưa chốt → cần mở phiên mới)',
  VoteValue: 'Giá trị phiếu bầu của thành viên Hội đồng: APPROVE, REJECT, ABSTAIN'
} as const

type EnumDocKey = keyof typeof ENUM_DOCS

const describeEnum = <T extends EnumLike>(enumObject: T, key: string) => {
  const values = valuesOf(enumObject)
  return `${ENUM_DOCS[key as EnumDocKey] ?? `Allowed values: ${values.join(', ')}`}. Values: ${values.join(', ')}`
}

export function zEnum<T extends EnumLike>(enumObject: T, key: string) {
  return z.enum(valuesOf(enumObject)).describe(describeEnum(enumObject, key))
}

export function zRole() {
  return zEnum(RoleCode, 'RoleCode')
}

export function zRoleSubset<T extends RoleCode>(roles: readonly T[]) {
  return z.enum(roles as [T, ...T[]]).describe(`Allowed role codes: ${roles.join(', ')}`)
}
