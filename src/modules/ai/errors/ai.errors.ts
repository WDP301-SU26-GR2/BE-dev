import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException
} from '@nestjs/common'
import { AiMessages } from '../ai.messages'

const E = AiMessages.error

export const AiNotEnabledException = new ServiceUnavailableException([{ message: E.aiNotEnabled, path: 'mode' }])
export const AiEnqueueFailedException = new ServiceUnavailableException([{ message: E.aiEnqueueFailed, path: 'mode' }])
export const PageHasNoFileException = new UnprocessableEntityException([{ message: E.pageHasNoFile, path: 'pageId' }])
export const SegmentJobAlreadyRunningException = new ConflictException([
  { message: E.segmentJobAlreadyRunning, path: 'pageId' }
])
export const AiJobNotFoundException = new NotFoundException([{ message: E.aiJobNotFound, path: 'id' }])
export const AiJobNotApplicableException = new ConflictException([{ message: E.aiJobNotApplicable, path: 'id' }])
