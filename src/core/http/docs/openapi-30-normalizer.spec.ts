import type { OpenAPIObject } from '@nestjs/swagger'
import { normalizeOpenApi30Document } from './openapi-30-normalizer'

describe('normalizeOpenApi30Document', () => {
  it('converts JSON Schema-only bounds and property names recursively', () => {
    const document = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0' },
      paths: {},
      components: {
        schemas: {
          boundedNumber: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 10 },
          dynamicRecord: {
            type: 'object',
            propertyNames: { type: 'string' },
            additionalProperties: { type: 'number' }
          },
          nested: {
            type: 'array',
            items: { type: 'number', exclusiveMinimum: 2 }
          },
          jsonValue: {
            anyOf: [
              { type: 'string' },
              {
                type: 'object',
                additionalProperties: { $ref: '#/components/schemas/jsonValue' }
              }
            ]
          },
          jsonMap: {
            type: 'object',
            additionalProperties: { $ref: '#/components/schemas/jsonValue' }
          }
        }
      }
    } as unknown as OpenAPIObject

    normalizeOpenApi30Document(document)

    const schemas = document.components?.schemas as Record<string, Record<string, unknown>>
    const jsonValue = schemas.jsonValue as { anyOf: Array<Record<string, unknown>> }
    expect(schemas.boundedNumber).toMatchObject({
      minimum: 0,
      exclusiveMinimum: true,
      maximum: 10,
      exclusiveMaximum: true
    })
    expect(schemas.dynamicRecord).toMatchObject({ type: 'object', additionalProperties: { type: 'number' } })
    expect(schemas.dynamicRecord).not.toHaveProperty('propertyNames')
    expect(schemas.nested.items).toMatchObject({ minimum: 2, exclusiveMinimum: true })
    expect(jsonValue.anyOf[1]).toMatchObject({ additionalProperties: true })
    expect(schemas.jsonMap).toMatchObject({ additionalProperties: true })
  })
})
