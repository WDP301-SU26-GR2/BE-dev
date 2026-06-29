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
  AnnotationTargetType: 'Annotation target: PAGE, REGION, TASK, MANUSCRIPT',
  AnnotationType: 'Annotation type: TEXT, HIGHLIGHT, DRAWING',
  ReviewStage: 'Review stage: ASSISTANT, MANGAKA, EDITOR',
  AssetType: 'Uploaded asset type'
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
