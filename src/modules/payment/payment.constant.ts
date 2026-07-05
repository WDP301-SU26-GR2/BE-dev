export const PAYMENT_EVENTS = {
  CREATED: 'payment.created',
  APPROVED: 'payment.approved',
  PAID: 'payment.paid',
  CANCELLED: 'payment.cancelled'
}

export const PAYMENT_CONDITION_STATUS = {
  PENDING: 'PENDING',
  ACHIEVED: 'ACHIEVED',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
  MISSED: 'MISSED',
  DISABLED: 'DISABLED'
} as const

export const CONDITION_TYPE = {
  CHAPTER_MILESTONE: 'CHAPTER_MILESTONE',
  RECURRING_CHAPTER: 'RECURRING_CHAPTER',
  RANKING_MILESTONE: 'RANKING_MILESTONE',
  TIME_BOUND: 'TIME_BOUND'
} as const

export type PaymentConditionStatusType = (typeof PAYMENT_CONDITION_STATUS)[keyof typeof PAYMENT_CONDITION_STATUS]

