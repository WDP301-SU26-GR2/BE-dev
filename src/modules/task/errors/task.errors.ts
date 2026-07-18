import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { TaskMessages } from '../task.messages'

const E = TaskMessages.error

export const PageNotFoundException = new NotFoundException([{ message: E.pageNotFound, path: 'pageId' }])
export const RegionNotFoundException = new NotFoundException([{ message: E.regionNotFound, path: 'id' }])
export const RegionHasApprovedTasksException = new ConflictException([
  { message: E.regionHasApprovedTasks, path: 'id' }
])
export const TaskNotFoundException = new NotFoundException([{ message: E.taskNotFound, path: 'id' }])
export const NotSeriesOwnerException = new ForbiddenException([{ message: E.notSeriesOwner, path: 'pageId' }])
export const NotTaskAssigneeException = new ForbiddenException([{ message: E.notTaskAssignee, path: 'id' }])
export const AssistantNotHiredException = new ConflictException([{ message: E.assistantNotHired, path: 'assistantId' }])
export const AssetNotFoundException = new UnprocessableEntityException([{ message: E.assetNotFound, path: 'assetIds' }])
export const TaskNotReassignableException = new ConflictException([{ message: E.taskNotReassignable, path: 'id' }])
export const TaskNotCancellableException = new ConflictException([{ message: E.taskNotCancellable, path: 'id' }])
export const ChapterOnHoldTaskException = new ConflictException([{ message: E.chapterOnHold, path: 'pageId' }])
export const PageNotEditableTaskException = new ConflictException([{ message: E.pageNotEditable, path: 'pageId' }])
export const InvalidTaskTransitionException = new ConflictException([
  { message: E.invalidTaskTransition, path: 'status' }
])
