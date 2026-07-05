import { Global, Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { AppConfigController } from './app-config.controller'
import { AppConfigRepository } from './app-config.repo'
import { AppConfigService } from './app-config.service'

@Global()
@Module({
  imports: [AuditModule],
  controllers: [AppConfigController],
  providers: [AppConfigService, AppConfigRepository],
  exports: [AppConfigService]
})
export class AppConfigModule {}
