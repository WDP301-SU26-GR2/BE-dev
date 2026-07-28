import SwaggerParser from '@apidevtools/swagger-parser'
import { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Test, TestingModule } from '@nestjs/testing'
import type { Redis } from 'ioredis'
import { cleanupOpenApiDoc } from 'nestjs-zod'
import { AppModule } from 'src/app.module'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { REDIS_BULL_CONNECTION, REDIS_CLIENT, REDIS_WS_CONNECTION } from 'src/infrastructure/redis/redis.constant'
import { normalizeOpenApi30Document } from './openapi-30-normalizer'

describe('OpenAPI contract', () => {
  let app: INestApplication
  let moduleFixture: TestingModule

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn()
      })
      .compile()

    // Swagger scans controller metadata and does not require external lifecycle hooks.
    app = moduleFixture.createNestApplication()
  })

  afterAll(async () => {
    ;[REDIS_CLIENT, REDIS_BULL_CONNECTION, REDIS_WS_CONNECTION]
      .map((token) => moduleFixture.get<Redis>(token, { strict: false }))
      .forEach((client) => client.disconnect())
    await app.close()
    await moduleFixture.close()
  })

  it('is a valid OpenAPI 3.0 document for code generators', async () => {
    const document = normalizeOpenApi30Document(
      cleanupOpenApiDoc(
        SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Contract').setVersion('1').build())
      )
    )
    const documentForValidation = JSON.parse(JSON.stringify(document)) as Parameters<typeof SwaggerParser.validate>[0]

    await expect(SwaggerParser.validate(documentForValidation)).resolves.toBeDefined()
  })
})
