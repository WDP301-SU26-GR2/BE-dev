import { Global, Module } from '@nestjs/common'
import { AuditController } from './audit.controller'
import { AuditRepository } from './audit.repo'
import { AuditService } from './audit.service'

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditRepository],
  exports: [AuditService]
})
export class AuditModule {}
