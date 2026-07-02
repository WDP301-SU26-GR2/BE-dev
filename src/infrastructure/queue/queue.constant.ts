import type { JobsOptions } from 'bullmq'

export const QUEUE = {
  EMAIL: 'email',
  NOTIFICATION: 'notification',
  AI: 'ai'
} as const

export const JOB = {
  SEND_OTP: 'send-otp',
  SEND_ADMIN_CRED: 'send-admin-cred',
  DISPATCH_NOTIFICATION: 'dispatch',
  SEGMENT_PAGE: 'segment-page'
} as const

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: true,
  removeOnFail: 1000
}

export const AI_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: true,
  removeOnFail: 1000
}
