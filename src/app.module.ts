import { Module } from '@nestjs/common'
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { ZodSerializerInterceptor } from 'nestjs-zod'
import { CatchEverythingFilter } from 'src/core/http/filters/catch-everything.filter'
import { ResponseEnvelopeInterceptor } from 'src/core/http/interceptors/response-envelope.interceptor'
import CustomZodValidationPipe from 'src/core/http/pipes/custom-zod-validation.pipe'
import { CoreModule } from 'src/core/core.module'
import { EmailQueueModule } from 'src/infrastructure/email/email-queue.module'
import { AuthModule } from './modules/auth/auth.module'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ContractModule } from './modules/contract/contract.module'
import { ChapterModule } from './modules/chapter/chapter.module'
import { NotificationModule } from './modules/notification/notification.module'
import { AnnotationModule } from './modules/annotation/annotation.module'
import { ReviewsModule } from './modules/reviews/reviews.module'
import { SeriesModule } from './modules/series/series.module'
import { NameModule } from './modules/name/name.module'
import { StorageModule } from './modules/storage/storage.module'
import { UsersModule } from './modules/users/users.module'
import { BoardModule } from './modules/board/board.module'
import { StudioModule } from './modules/studio/studio.module'
import { SurveyModule } from './modules/survey/survey.module'
import { TaskModule } from './modules/task/task.module'
import { TankobonModule } from './modules/tankobon/tankobon.module'
import { DeadlineModule } from './modules/deadline/deadline.module'
import { AiModule } from './modules/ai/ai.module'
import { ReprintRequestModule } from './modules/reprint/reprint-request.module'
import { TransferModule } from './modules/transfer/transfer.module'
import { PaymentModule } from './modules/payment/payment.module'
import { AuditModule } from './modules/audit/audit.module'
import { RevisionModule } from './modules/revision/revision.module'
import { AppConfigModule } from './modules/app-config/app-config.module'
import { PublicationModule } from './modules/publication/publication.module'
import { PublicModule } from './modules/public/public.module'
import { DashboardModule } from './modules/dashboard/dashboard.module'

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    CoreModule,
    AuthModule,
    ContractModule,
    EmailQueueModule,
    UsersModule,
    NotificationModule,
    ReviewsModule,
    SeriesModule,
    NameModule,
    StorageModule,
    ChapterModule,
    AnnotationModule,
    BoardModule,
    SurveyModule,
    StudioModule,
    TaskModule,
    TankobonModule,
    DeadlineModule,
    AiModule,
    ReprintRequestModule,
    TransferModule,
    PaymentModule,
    AuditModule,
    RevisionModule,
    AppConfigModule,
    PublicationModule,
    DashboardModule,
    PublicModule
  ],
  controllers: [],
  providers: [
    {
      provide: APP_PIPE,
      useClass: CustomZodValidationPipe
    },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    {
      provide: APP_FILTER,
      useClass: CatchEverythingFilter
    }
  ]
})
export class AppModule {}
