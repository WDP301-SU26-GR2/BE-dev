import type { JobsOptions } from 'bullmq'

export const QUEUE = {
  EMAIL: 'email',
  NOTIFICATION: 'notification'
} as const

export const JOB = {
  SEND_OTP: 'send-otp',
  SEND_ADMIN_CRED: 'send-admin-cred',
  DISPATCH_NOTIFICATION: 'dispatch'
} as const

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: true,
  removeOnFail: 1000
}
