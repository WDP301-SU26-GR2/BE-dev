import { z } from 'zod'
import { AnnotationResSchema } from 'src/modules/annotation/schemas/annotation-schemas'
import { ProductionStageResSchema } from 'src/modules/chapter/schemas/production-stage-schemas'
import { AmendmentResSchema } from 'src/modules/contract/schemas/contract-amendment-schema'
import { DeadlineRequestResSchema } from 'src/modules/deadline/schemas/deadline-schemas'
import { PayPaymentBodySchema, PaymentRecordResSchema } from 'src/modules/payment/schemas/payment-schema'
import { PublicationVersionResSchema } from 'src/modules/publication/schemas/publication-schemas'
import { ReprintRequestResSchema } from 'src/modules/reprint/schemas/reprint-request-schema'
import { SeriesResSchema } from 'src/modules/series/schemas/series-schemas'
import { DefenseDashboardResSchema } from 'src/modules/tankobon/schemas/tankobon-schemas'
import { RegionResSchema } from 'src/modules/task/schemas/task-schemas'
import { TransferContractSchema, TransferRequestSchema } from 'src/modules/transfer/schemas/transfer-schema'
import {
  AssistantDirectoryItemSchema,
  AssistantProfileBodySchema,
  AssistantProfileResSchema,
  ListAssistantsQuerySchema,
  ListMangakasQuerySchema,
  MangakaDirectoryItemSchema,
  MangakaProfileBodySchema,
  MangakaProfileResSchema
} from 'src/modules/users/schemas/users-schemas'

type JsonSchemaNode = Record<string, unknown>

const variants = (node: JsonSchemaNode): JsonSchemaNode[] => {
  const nested = [
    ...((node.anyOf as JsonSchemaNode[] | undefined) ?? []),
    ...((node.oneOf as JsonSchemaNode[] | undefined) ?? [])
  ]
  return [node, ...nested.flatMap(variants)]
}

const propertyNode = (schema: z.ZodType, path: readonly string[], io: 'input' | 'output' = 'output') => {
  let node = z.toJSONSchema(schema, { io }) as JsonSchemaNode

  for (const segment of path) {
    if (segment === '[]') {
      const withItems = variants(node).find((candidate) => candidate.items)
      if (!withItems) throw new Error(`Missing array items at ${path.join('.')}`)
      node = withItems.items as JsonSchemaNode
      continue
    }

    const withProperty = variants(node).find((candidate) => {
      const properties = candidate.properties as Record<string, JsonSchemaNode> | undefined
      return properties?.[segment]
    })
    if (!withProperty) throw new Error(`Missing property ${segment} at ${path.join('.')}`)
    node = (withProperty.properties as Record<string, JsonSchemaNode>)[segment]
  }

  return node
}

const enumValues = (node: JsonSchemaNode) => {
  const values = variants(node).flatMap((candidate) => (candidate.enum as string[] | undefined) ?? [])
  return [...new Set(values)]
}

const expectSwaggerEnum = (
  schema: z.ZodType,
  path: readonly string[],
  expected: readonly string[],
  io: 'input' | 'output' = 'output'
) => {
  expect(enumValues(propertyNode(schema, path, io))).toEqual(expected)
}

describe('Swagger bounded string fields expose enums', () => {
  it('documents transfer request and contract enum responses', () => {
    expectSwaggerEnum(TransferRequestSchema, ['originalContractType'], ['FULL_BUYOUT', 'REVENUE_SHARE'])
    expectSwaggerEnum(TransferRequestSchema, ['proposedType'], ['FULL_TRANSFER', 'PARTIAL_TRANSFER'])
    expectSwaggerEnum(TransferContractSchema, ['transferType'], ['FULL_TRANSFER', 'PARTIAL_TRANSFER'])
  })

  it('documents experience levels consistently in profile and directory contracts', () => {
    const levels = ['JUNIOR', 'MID', 'SENIOR']
    for (const schema of [MangakaProfileBodySchema, AssistantProfileBodySchema]) {
      expectSwaggerEnum(schema, ['experienceLevel'], levels, 'input')
    }
    for (const schema of [
      MangakaProfileResSchema,
      AssistantProfileResSchema,
      MangakaDirectoryItemSchema,
      AssistantDirectoryItemSchema
    ]) {
      expectSwaggerEnum(schema, ['experienceLevel'], levels)
    }
    for (const schema of [ListMangakasQuerySchema, ListAssistantsQuerySchema]) {
      expectSwaggerEnum(schema, ['level'], levels, 'input')
    }
  })

  it('documents payment methods in request and detail response contracts', () => {
    const methods = ['BANK_TRANSFER', 'CASH']
    expectSwaggerEnum(PayPaymentBodySchema, ['paymentMethod'], methods, 'input')
    expectSwaggerEnum(PaymentRecordResSchema, ['paymentMethod'], methods)
  })

  it('documents role-like bounded response fields', () => {
    expectSwaggerEnum(SeriesResSchema, ['completionProposal', 'proposedByRole'], ['MANGAKA', 'EDITOR'])
    expectSwaggerEnum(AmendmentResSchema, ['signatures', '[]', 'role'], ['BOARD_MEMBER'])
    expectSwaggerEnum(
      AnnotationResSchema,
      ['authorRole'],
      ['MANGAKA', 'ASSISTANT', 'EDITOR', 'BOARD_MEMBER', 'SUPER_ADMIN']
    )
    expectSwaggerEnum(DeadlineRequestResSchema, ['requestedBy'], ['MANGAKA', 'EDITOR'])
    expectSwaggerEnum(DeadlineRequestResSchema, ['lastProposedBy'], ['MANGAKA', 'EDITOR'])
  })

  it('documents other exposed bounded string response fields', () => {
    expectSwaggerEnum(
      ReprintRequestResSchema,
      ['status'],
      [
        'PENDING',
        'MANGAKA_APPROVED',
        'BOARD_APPROVED',
        'PROPOSED',
        'MANGAKA_REVIEW',
        'IN_PRODUCTION',
        'APPROVED',
        'PUBLISHED',
        'REJECTED',
        'REJECTED_BY_MANGAKA'
      ]
    )
    expectSwaggerEnum(PublicationVersionResSchema, ['versionType'], ['ORIGINAL', 'DIGITAL', 'FLIPPED'])
    expectSwaggerEnum(RegionResSchema, ['createdBy'], ['MANUAL', 'AI'])
    expectSwaggerEnum(
      ProductionStageResSchema,
      ['analytics', 'longestTask', 'taskType'],
      ['BACKGROUND', 'SCREENTONE', 'EFFECT_LINES', 'INKING', 'COLORING', 'LETTERING']
    )
    expectSwaggerEnum(
      DefenseDashboardResSchema,
      ['rankingTrend', '[]', 'riskLevel'],
      ['NONE', 'LOW', 'MEDIUM', 'SEVERE']
    )
  })

  it('rejects values outside bounded input contracts', () => {
    expect(
      AssistantProfileBodySchema.safeParse({ specializations: [], experienceLevel: 'EXPERT', portfolioFiles: [] })
        .success
    ).toBe(false)
    expect(PayPaymentBodySchema.safeParse({ paymentMethod: 'CRYPTO', transactionReference: 'tx-1' }).success).toBe(
      false
    )
  })
})
