import { Module } from '@nestjs/common'
import { ChapterModule } from 'src/modules/chapter/chapter.module'
import { StorageModule } from 'src/modules/storage/storage.module'
import { StudioModule } from 'src/modules/studio/studio.module'
import { TaskController } from './task.controller'
import { TaskRepository } from './task.repo'
import { TaskService } from './task.service'
import { RegionService } from './services/region.service'
import { TaskStateService } from './services/task-state.service'
import { TaskAssignService } from './services/task-assign.service'
import { TaskAssignmentCreateService } from './services/task-assignment-create.service'
import { TaskAssignmentMutationService } from './services/task-assignment-mutation.service'
import { TaskAssignmentValidatorService } from './services/task-assignment-validator.service'
import { TaskReviewService } from './services/task-review.service'
import { TaskMediaService } from './services/task-media.service'
import { AssistantAvailabilityListener } from './services/assistant-availability.listener'
import { TaskOverdueCancelCron } from './services/task-overdue-cancel.cron'

@Module({
  imports: [ChapterModule, StorageModule, StudioModule],
  controllers: [TaskController],
  providers: [
    TaskService,
    TaskRepository,
    RegionService,
    TaskStateService,
    TaskAssignService,
    TaskAssignmentValidatorService,
    TaskAssignmentCreateService,
    TaskAssignmentMutationService,
    TaskReviewService,
    TaskMediaService,
    AssistantAvailabilityListener,
    TaskOverdueCancelCron
  ],
  exports: [RegionService]
})
export class TaskModule {}
