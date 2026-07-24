import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { ChapterMessages } from '../chapter.messages'

const E = ChapterMessages.error

export const StageNotFoundException = new NotFoundException([{ message: E.stageNotFound, path: 'stageId' }])
export const StageAccessDeniedException = new ForbiddenException([{ message: E.stageAccessDenied, path: 'stageId' }])
export const StageRequiredException = new UnprocessableEntityException([{ message: E.stageRequired, path: 'stageId' }])
export const StageLockedException = new ConflictException([{ message: E.stageLocked, path: 'stageId' }])
export const StageNotActiveException = new ConflictException([{ message: E.stageNotActive, path: 'stageId' }])
export const StageHasOpenTasksException = new ConflictException([{ message: E.stageHasOpenTasks, path: 'stageId' }])
export const StageOutputNotReadyException = new ConflictException([{ message: E.stageOutputNotReady, path: 'stageId' }])
export const StagePageNotFoundException = new NotFoundException([{ message: E.stagePageNotFound, path: 'pageId' }])
export const StageOutputInvalidException = new UnprocessableEntityException([
  { message: E.stageOutputInvalid, path: 'items' }
])
export const ProductionPageSetLockedException = new ConflictException([
  { message: E.productionPageSetLocked, path: 'chapterId' }
])
export const TaskTypeNotInStageException = new UnprocessableEntityException([
  { message: E.taskTypeNotInStage, path: 'taskType' }
])
export const StageNotEditableException = new ConflictException([{ message: E.stageNotEditable, path: 'stageId' }])
export const StageNotDeletableException = new ConflictException([{ message: E.stageNotDeletable, path: 'stageId' }])
export const ProductionNotFinalizedException = new ConflictException([
  { message: E.productionNotFinalized, path: 'chapterId' }
])
