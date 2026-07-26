import { ServiceUnavailableException } from '@nestjs/common'
import { HealthMessages } from '../health.messages'

export const ServiceNotReadyException = new ServiceUnavailableException(HealthMessages.error.notReady)
