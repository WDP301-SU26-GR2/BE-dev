import { Module } from '@nestjs/common'
import { AuthModule } from 'src/modules/auth/auth.module'
import { SurveyController } from './survey.controller'
import { SurveyService } from './services/survey.service'
import { SurveyConfigService } from './services/survey-config.service'
import { SurveyRepository } from './survey.repo'
import { NotificationModule } from '../notification/notification.module'
import { RecaptchaService } from 'src/infrastructure/captcha/recaptcha.service'

@Module({
  imports: [AuthModule, NotificationModule],
  controllers: [SurveyController],
  providers: [SurveyService, SurveyConfigService, SurveyRepository, RecaptchaService],
  exports: [SurveyService, SurveyConfigService]
})
export class SurveyModule {}
