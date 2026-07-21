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
import { TaskReviewService } from './services/task-review.service'
import { TaskMediaService } from './services/task-media.service'
import { AssistantAvailabilityListener } from './services/assistant-availability.listener'

@Module({
  imports: [ChapterModule, StorageModule, StudioModule],
  controllers: [TaskController],
  providers: [
    TaskService,
    TaskRepository,
    RegionService,
    TaskStateService,
    TaskAssignService,
    TaskReviewService,
    TaskMediaService,
    AssistantAvailabilityListener
  ],
  exports: [RegionService]
})
export class TaskModule {}
