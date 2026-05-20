import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ZodValidationPipe } from 'nestjs-zod'
import envConfig from 'src/shared/config/envConfig'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.useGlobalPipes(new ZodValidationPipe())

  await app.listen(envConfig.PORT ?? 3000)
}
bootstrap()
