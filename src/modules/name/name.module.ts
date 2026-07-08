import { Module } from '@nestjs/common'
import { NameController } from './name.controller'
import { NameService } from './name.service'
import { NameRepo } from './name.repo'

// Spec 8 §2: module `name` vertical slice (AGENTS §2). Controller inject NameService only;
// NameService orchestrates NameRepo + (eventBus/notification/appConfig đều @Global).
// NameService + NameRepo exported để series module nếu sau này cần (hiện tại proposal flow
// vẫn đi qua series.repo.createProposalSeries — atomic, xem spec §2 ngoại lệ).
@Module({
  controllers: [NameController],
  providers: [NameService, NameRepo],
  exports: [NameService, NameRepo]
})
export class NameModule {}
