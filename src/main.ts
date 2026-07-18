import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { cleanupOpenApiDoc } from 'nestjs-zod'
import envConfig from 'src/core/config/envConfig'
import { corsOrigins } from 'src/core/config/cors'
import { z } from 'zod'
import { vi } from 'zod/locales'

z.config(vi())

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.getHttpAdapter().getInstance().set('trust proxy', envConfig.TRUST_PROXY_HOPS)
  app.enableShutdownHooks()
  app.enableCors({ origin: corsOrigins() })
  const config = new DocumentBuilder()
    .setTitle('WDP API')
    .setDescription(
      [
        'Mangaka Backend API.',
        '',
        '### ⚠️ Response envelope (ĐỌC TRƯỚC)',
        'Mọi response **thành công** đều được bọc envelope — schema/Example Value bên dưới mô tả phần **CHƯA bọc** (chính là `data`):',
        '```jsonc',
        '{ "success": true, "message": "Thành công", "data": { /* shape mô tả trong từng API */ } }',
        '```',
        '→ **FE luôn đọc `res.data`** (KHÔNG đọc thẳng field gốc). Một số API trả `message` tuỳ biến (vd xoá) → message nằm ở top-level, `data` có thể `null`.',
        '',
        'Mọi response **lỗi** (chuẩn hoá bởi 1 filter duy nhất):',
        '```jsonc',
        '{ "success": false, "statusCode": 409, "code": "Error.ProposalNotEditable",',
        '  "message": "Không thể chỉnh sửa bản đề xuất ở trạng thái hiện tại" }             // lỗi đơn',
        '{ "success": false, "statusCode": 422, "code": "Error.ValidationFailed",',
        '  "message": "Địa chỉ email không hợp lệ",',
        '  "errors": [ { "code": null, "message": "Địa chỉ email không hợp lệ", "path": "email" } ] } // lỗi field-level',
        '```',
        '`message` luôn là tiếng Việt để hiển thị; FE phân nhánh theo `code` ổn định. Validation fail = **422** (không phải 400).'
      ].join('\n')
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  const documentFactory = () => cleanupOpenApiDoc(SwaggerModule.createDocument(app, config))
  SwaggerModule.setup('api', app, documentFactory())
  await app.listen(envConfig.PORT ?? 4000)
}
void bootstrap()
