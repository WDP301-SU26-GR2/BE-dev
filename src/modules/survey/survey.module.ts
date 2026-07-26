import { Module } from '@nestjs/common'
import { SurveyController } from './survey.controller'
import { SurveyService } from './services/survey.service'
import { SurveyConfigService } from './services/survey-config.service'
import { SurveyRepository } from './survey.repo'
import { NotificationModule } from '../notification/notification.module'
import { RecaptchaService } from 'src/infrastructure/captcha/recaptcha.service'
import { RankingAggregateService } from './services/ranking-aggregate.service'
import { VoteTallyService } from './services/vote-tally.service'
import { VoteGateway } from './vote.gateway'
import { SurveyOtpService } from './services/survey-otp.service'
import { VoteOtpRepository } from './vote-otp.repo'
import { GuestEmailOtpDeliveryService } from './services/guest-email-otp-delivery.service'
import { GuestOtpDeliveryPort } from './ports/guest-otp-delivery.port'
import { SurveyOtpRequestService } from './services/survey-otp-request.service'
import { ReaderVoteService } from './services/reader-vote.service'
import { GuestVoteService } from './services/guest-vote.service'
import { SurveyPeriodService } from './services/survey-period.service'
import { SurveyImportService } from './services/survey-import.service'
import { RankingFinalizeService } from './services/ranking-finalize.service'
import { InternalRankingQueryService } from './services/internal-ranking-query.service'
import { PublicVoteQueryService } from './services/public-vote-query.service'
import { RankingQueryService } from './services/ranking-query.service'
import { PublicRankingController } from './public-ranking.controller'
import { PublicVoteContextQueryService } from './services/public-vote-context-query.service'
import { PublicRankingQueryService } from './services/public-ranking-query.service'
import { RankingFinalizeEffectsService } from './services/ranking-finalize-effects.service'
import { RankingFinalizePersistenceService } from './services/ranking-finalize-persistence.service'

@Module({
  imports: [NotificationModule],
  controllers: [SurveyController, PublicRankingController],
  providers: [
    SurveyService,
    SurveyOtpRequestService,
    ReaderVoteService,
    GuestVoteService,
    SurveyPeriodService,
    SurveyImportService,
    RankingFinalizeService,
    RankingFinalizeEffectsService,
    RankingFinalizePersistenceService,
    InternalRankingQueryService,
    PublicVoteQueryService,
    PublicVoteContextQueryService,
    PublicRankingQueryService,
    RankingQueryService,
    SurveyConfigService,
    SurveyRepository,
    RecaptchaService,
    RankingAggregateService,
    VoteTallyService,
    VoteGateway,
    VoteOtpRepository,
    SurveyOtpService,
    GuestEmailOtpDeliveryService,
    { provide: GuestOtpDeliveryPort, useExisting: GuestEmailOtpDeliveryService }
  ],
  exports: [SurveyService, SurveyConfigService]
})
export class SurveyModule {}
