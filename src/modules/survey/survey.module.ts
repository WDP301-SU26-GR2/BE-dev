import { Module } from '@nestjs/common'
import { AuthModule } from 'src/modules/auth/auth.module'
import { SurveyController } from './survey.controller'
import { SurveyService } from './services/survey.service'
import { SurveyRepository } from './survey.repo'
import { NotificationModule } from '../notification/notification.module'

@Module({
  imports: [AuthModule, NotificationModule],
  controllers: [SurveyController],
  providers: [SurveyService, SurveyRepository],
  exports: [SurveyService]
})
export class SurveyModule {}
