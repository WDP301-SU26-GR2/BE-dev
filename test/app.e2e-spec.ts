import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { App } from 'supertest/types'
import { AppModule } from './../src/app.module'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { cleanupOpenApiDoc } from 'nestjs-zod'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import SwaggerParser from '@apidevtools/swagger-parser'
import { normalizeOpenApi30Document } from 'src/core/http/docs/openapi-30-normalizer'

describe('AppModule (e2e)', () => {
  let app: INestApplication<App>

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn()
      })
      .compile()

    app = moduleFixture.createNestApplication()
    app.enableCors({ origin: ['https://app.example.com'] })
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  it('boots the app and validates a public auth route', () => {
    return request(app.getHttpServer()).post('/auth/login').send({}).expect(422)
  })

  it('publishes an OpenAPI 3.0 document consumable by code generators', async () => {
    const document = normalizeOpenApi30Document(
      cleanupOpenApiDoc(
        SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('E2E').setVersion('1').build())
      )
    )
    const documentForValidation = JSON.parse(JSON.stringify(document)) as Parameters<typeof SwaggerParser.validate>[0]

    await expect(SwaggerParser.validate(documentForValidation)).resolves.toBeDefined()
    expect(document.paths['/auth/login']?.post).toBeDefined()
    expect(document.paths['/health/ready']?.get).toBeDefined()
  })

  it('allows the configured browser origin and omits CORS permission for an unknown origin', async () => {
    await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', 'https://app.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .expect('Access-Control-Allow-Origin', 'https://app.example.com')
      .expect(204)

    const denied = await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST')

    expect(denied.headers['access-control-allow-origin']).toBeUndefined()
  })
})
