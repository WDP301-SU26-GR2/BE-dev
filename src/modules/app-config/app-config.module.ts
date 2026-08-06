import { Global, Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { AppConfigController } from './app-config.controller'
import { MagazineController } from './controllers/magazine.controller'
import { AppConfigRepository } from './app-config.repo'
import { AppConfigService } from './app-config.service'
import { MagazineRegistryService } from './services/magazine-registry.service'
// Adapter đếm usage của Series/SurveyPeriod cho guard magazine. Chúng chỉ inject Prisma client (@Global
// qua CoreModule) nên KHÔNG cần import SeriesModule/SurveyModule ở đây — tránh vòng phụ thuộc.
// ⚠ ĐỪNG viết tên class Prisma đầy đủ trong file *.module.ts (kể cả trong comment): guard
// test/architecture quét raw-text, mọi lần xuất hiện token đó ở *.module.ts đều làm CI đỏ.
import { MagazineUsageSeriesAdapter } from '../series/adapters/magazine-usage-series.adapter'
import { MagazineUsageSurveyAdapter } from '../survey/adapters/magazine-usage-survey.adapter'

@Global()
@Module({
  imports: [AuditModule],
  controllers: [AppConfigController, MagazineController],
  providers: [
    AppConfigService,
    AppConfigRepository,
    MagazineRegistryService,
    MagazineUsageSeriesAdapter,
    MagazineUsageSurveyAdapter
  ],
  exports: [AppConfigService, MagazineRegistryService]
})
export class AppConfigModule {}
