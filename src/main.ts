import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { cleanupOpenApiDoc } from 'nestjs-zod'
import envConfig from 'src/core/config/envConfig'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.getHttpAdapter().getInstance().set('trust proxy', envConfig.TRUST_PROXY_HOPS)
  app.enableShutdownHooks()
  app.enableCors()
  const config = new DocumentBuilder()
    .setTitle('WDP API')
    .setDescription('The WDP API description')
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  const documentFactory = () => cleanupOpenApiDoc(SwaggerModule.createDocument(app, config))
  SwaggerModule.setup('api', app, documentFactory())
  await app.listen(envConfig.PORT ?? 4000)
}
void bootstrap()
