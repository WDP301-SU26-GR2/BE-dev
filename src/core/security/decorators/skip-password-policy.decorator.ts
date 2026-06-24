import { SetMetadata } from '@nestjs/common'

export const SKIP_PASSWORD_POLICY_KEY = 'skipPasswordPolicy'
export const SkipPasswordPolicy = () => SetMetadata(SKIP_PASSWORD_POLICY_KEY, true)
