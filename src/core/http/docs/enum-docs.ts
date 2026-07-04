import { RoleCode } from '@prisma/client'
import { z } from 'zod'

type EnumLike = Record<string, string>

const valuesOf = <T extends EnumLike>(enumObject: T) => Object.values(enumObject) as [T[keyof T], ...T[keyof T][]]

export const ENUM_DOCS = {
  RoleCode: 'Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN',
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
  ChapterStatus: 'Chapter production status',
  ManuscriptStatus: 'Manuscript production status',
  PageStatus: 'Page production status',
  AnnotationTargetType: 'Annotation target: PAGE, REGION, TASK, MANUSCRIPT, NAME',
  AnnotationType: 'Annotation type: TEXT, HIGHLIGHT, DRAWING',
  ReviewStage: 'Review stage: ASSISTANT, MANGAKA, EDITOR',
  AssetType: 'Uploaded asset type',
  NotificationType: 'Notification type: SYSTEM, CONTRACT, TASK, DEADLINE, SURVEY, BOARD, REVIEW',
  AiJobType: 'AI job type: SEGMENT; COLOR/NUMBER are reserved for Spec 3',
  AiJobStatus: 'AI job lifecycle: QUEUED -> RUNNING -> SUCCEEDED | FAILED',
  AiSegmentMode: 'Segmentation mode: MODEL (YOLO deep learning) or HEURISTIC (OpenCV baseline)',
  WarningLevel: 'Deadline warning: NONE an toan, YELLOW nguy co, RED kho kip, CRITICAL qua han',
  DeadlineRequestStatus:
    'Deadline negotiation status: PROPOSED, COUNTER_PROPOSED, AGREED_BY_PARTIES, APPROVED, REJECTED, ESCALATED, BOARD_REVIEW',
  TaskStatus:
    'Task production status: ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED/REVISION_REQUESTED; ON_HOLD khi assistant nghỉ',
  RegionType: 'Loại vùng trên trang: PANEL, BACKGROUND, SPEECH_BUBBLE, SFX, CHARACTER',
  TaskVersionReviewStatus: 'Trạng thái review của 1 bản nộp task: PENDING, APPROVED, REVISION_REQUESTED'
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
