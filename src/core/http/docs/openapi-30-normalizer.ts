import type { OpenAPIObject } from '@nestjs/swagger'

type JsonObject = Record<string, unknown>

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * nestjs-zod emits a few JSON Schema 2020-12 keywords while Nest advertises
 * OpenAPI 3.0. Convert their equivalent forms so the published contract stays
 * valid for OpenAPI 3.0 clients such as Orval.
 */
export function normalizeOpenApi30Document(document: OpenAPIObject): OpenAPIObject {
  normalizeNode(document, findRecursiveMapSchemaRefs(document))
  return document
}

function findRecursiveMapSchemaRefs(document: OpenAPIObject): ReadonlySet<string> {
  const schemas =
    isJsonObject(document.components) && isJsonObject(document.components.schemas) ? document.components.schemas : {}

  return new Set(
    Object.entries(schemas)
      .filter(([name, schema]) => containsReference(schema, `#/components/schemas/${name}`))
      .map(([name]) => `#/components/schemas/${name}`)
  )
}

function containsReference(value: unknown, reference: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsReference(item, reference))
  if (!isJsonObject(value)) return false
  if (value.$ref === reference) return true
  return Object.values(value).some((item) => containsReference(item, reference))
}

function normalizeNode(value: unknown, recursiveMapSchemaRefs: ReadonlySet<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => normalizeNode(item, recursiveMapSchemaRefs))
    return
  }

  if (!isJsonObject(value)) return

  if (typeof value.exclusiveMinimum === 'number') {
    value.minimum = value.exclusiveMinimum
    value.exclusiveMinimum = true
  }

  if (typeof value.exclusiveMaximum === 'number') {
    value.maximum = value.exclusiveMaximum
    value.exclusiveMaximum = true
  }

  const additionalPropertiesRef = isJsonObject(value.additionalProperties) ? value.additionalProperties.$ref : undefined
  if (typeof additionalPropertiesRef === 'string' && recursiveMapSchemaRefs.has(additionalPropertiesRef)) {
    value.additionalProperties = true
  }

  // `propertyNames` is a JSON Schema keyword unsupported by OpenAPI 3.0.
  // `additionalProperties` still documents the dynamic-value shape of records.
  delete value.propertyNames

  Object.values(value).forEach((item) => normalizeNode(item, recursiveMapSchemaRefs))
}
