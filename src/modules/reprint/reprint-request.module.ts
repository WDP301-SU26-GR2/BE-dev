import { Module } from '@nestjs/common'
import { ReprintRequestController } from './reprint-request.controller'
import { ReprintRequestStateService } from './services/reprint-request-state.service'
import { ReprintRequestRepo } from './reprint-request.repo'
import { NotificationModule } from '../notification/notification.module'
import { AuditModule } from '../audit/audit.module'
import { ReprintAccessPolicy } from './services/reprint-access.policy'
import { ReprintQueryService } from './services/reprint-query.service'
import { ReprintChapterService } from './services/reprint-chapter.service'
import { ReprintRequestFacade } from './services/reprint-request.facade'
import { ReprintAssignmentService } from './services/reprint-assignment.service'
import { ReprintCreationService } from './services/reprint-creation.service'
import { ReprintReviewService } from './services/reprint-review.service'
import { ReprintWorkflowService } from './services/reprint-workflow.service'

@Module({
  imports: [NotificationModule, AuditModule],
  controllers: [ReprintRequestController],
  providers: [
    ReprintRequestFacade,
    ReprintQueryService,
    ReprintChapterService,
    ReprintCreationService,
    ReprintReviewService,
    ReprintAssignmentService,
    ReprintWorkflowService,
    ReprintRequestStateService,
    ReprintAccessPolicy,
    ReprintRequestRepo
  ],
  exports: [ReprintRequestFacade]
})
export class ReprintRequestModule {}
