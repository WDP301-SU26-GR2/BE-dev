import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { TaskMessages } from '../task.messages'

const E = TaskMessages.error

export const PageNotFoundException = new NotFoundException([{ message: E.pageNotFound, path: 'pageId' }])
export const RegionNotFoundException = new NotFoundException([{ message: E.regionNotFound, path: 'id' }])
export const RegionHasTasksException = new ConflictException([{ message: E.regionHasTasks, path: 'id' }])
export const TaskNotFoundException = new NotFoundException([{ message: E.taskNotFound, path: 'id' }])
export const NotSeriesOwnerException = new ForbiddenException([{ message: E.notSeriesOwner, path: 'pageId' }])
export const NotTaskAssigneeException = new ForbiddenException([{ message: E.notTaskAssignee, path: 'id' }])
export const AssistantNotHiredException = new ConflictException([{ message: E.assistantNotHired, path: 'assistantId' }])
export const AssetNotFoundException = new UnprocessableEntityException([{ message: E.assetNotFound, path: 'assetIds' }])
export const TaskNotReassignableException = new ConflictException([{ message: E.taskNotReassignable, path: 'id' }])
export const InvalidTaskTransitionException = new ConflictException([
  { message: E.invalidTaskTransition, path: 'status' }
])
