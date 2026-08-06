import { Global, Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { MagazineController } from './magazine.controller'
import { MagazineRegistryService } from './magazine.service'
// Danh mục tạp chí sống ở AppConfig (đọc/ghi field magazines[] qua AppConfigRepository — AppConfigModule @Global export).
// Adapter đếm usage của Series/SurveyPeriod chỉ inject Prisma client (@Global qua CoreModule) nên KHÔNG cần import
// SeriesModule/SurveyModule ở đây — tránh vòng phụ thuộc.
// ⚠ ĐỪNG viết tên class Prisma đầy đủ trong file *.module.ts (kể cả trong comment): guard
// test/architecture quét raw-text, mọi lần xuất hiện token đó ở *.module.ts đều làm CI đỏ.
import { MagazineUsageSeriesAdapter } from '../series/adapters/magazine-usage-series.adapter'
import { MagazineUsageSurveyAdapter } from '../survey/adapters/magazine-usage-survey.adapter'

@Global()
@Module({
  imports: [AuditModule],
  controllers: [MagazineController],
  providers: [MagazineRegistryService, MagazineUsageSeriesAdapter, MagazineUsageSurveyAdapter],
  exports: [MagazineRegistryService]
})
export class MagazineModule {}
