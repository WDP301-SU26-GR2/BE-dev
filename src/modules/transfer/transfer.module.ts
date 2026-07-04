import { Module } from '@nestjs/common'
import { TransferController } from './transfer.controller'
import { TransferService } from './services/transfer.service'
import { TransferRepo } from './transfer.repo'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { AuthModule } from 'src/modules/auth/auth.module' // Đảm bảo đường dẫn này khớp với vị trí AuthModule của bạn

@Module({
  imports: [
    // Import AuthModule để TransferService có thể inject và sử dụng AuthOtpService
    AuthModule
  ],
  controllers: [TransferController],
  providers: [TransferService, TransferRepo, PrismaService],
  exports: [
    TransferService // Export nếu các module khác (như module quản lý Chapter/Scheduler) cần gọi dùng chung
  ]
})
export class TransferModule {}
