import { z } from 'zod'

/**
 * Date field cho RESPONSE schema (module parse thẳng Prisma entity, không có mapper).
 *
 * Prisma trả `Date`; wire phải là ISO 8601 string. `preprocess` convert Date → ISO,
 * còn string đi qua nguyên vẹn (idempotent → an toàn khi entity đã được mapper xử lý).
 *
 * ⚠ PHẢI dùng z.preprocess. KHÔNG dùng union + transform:
 *   z.union([z.date(), z.string()]).transform(...)
 *   → z.toJSONSchema ném "Transforms cannot be represented in JSON Schema" → VỠ BOOT Swagger.
 *   (Đã probe thật trên zod 4.4.3. Test `date-docs.spec.ts` khoá lại hành vi này.)
 */
export const zDateField = (description = 'ISO 8601 date-time (UTC)') =>
  z
    .preprocess((v) => (v instanceof Date ? v.toISOString() : v), z.string().datetime({ offset: true }))
    .describe(description)
