import { Module } from '@nestjs/common'
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { ZodSerializerInterceptor } from 'nestjs-zod'
import { CatchEverythingFilter } from 'src/core/http/filters/catch-everything.filter'
import { HttpExceptionFilter } from 'src/core/http/filters/http-exception.filter'
import CustomZodValidationPipe from 'src/core/http/pipes/custom-zod-validation.pipe'
import { CoreModule } from 'src/core/core.module'
import { AuthModule } from './modules/auth/auth.module'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ContractModule } from './modules/contract/contract.module'

@Module({
  imports: [EventEmitterModule.forRoot(), CoreModule, AuthModule, ContractModule],
  controllers: [],
  providers: [
    {
      provide: APP_PIPE,
      useClass: CustomZodValidationPipe
    },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter
    },
    {
      provide: APP_FILTER,
      useClass: CatchEverythingFilter
    }
  ]
})
export class AppModule {}
