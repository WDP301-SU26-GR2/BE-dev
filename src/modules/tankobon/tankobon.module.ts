import { Module } from '@nestjs/common'
import { TankobonController } from './tankobon.controller'
import { TankobonService } from './tankobon.service'
import { TankobonRepo } from './tankobon.repo'

@Module({
  controllers: [TankobonController],
  providers: [TankobonService, TankobonRepo]
})
export class TankobonModule {}
