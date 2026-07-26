import { Module } from '@nestjs/common'
import { NameController } from './name.controller'
import { ChapterNameController } from './chapter-name.controller'
import { NameService } from './name.service'
import { NameRepo } from './name.repo'
import { NameApprovalService } from './services/name-approval.service'
import { NameApprovalQueryPort } from 'src/modules/series/ports/name-approval-query.port'
import { NameFacade } from './services/name.facade'
import { NameQueryService } from './services/name-query.service'
import { NameAccessService } from './services/name-access.service'
import { NameContentService } from './services/name-content.service'
import { NameReviewService } from './services/name-review.service'

@Module({
  controllers: [NameController, ChapterNameController],
  providers: [
    NameService,
    NameFacade,
    NameQueryService,
    NameAccessService,
    NameContentService,
    NameReviewService,
    NameRepo,
    NameApprovalService,
    { provide: NameApprovalQueryPort, useExisting: NameApprovalService }
  ],
  exports: [NameService, NameApprovalService, NameApprovalQueryPort]
})
export class NameModule {}
