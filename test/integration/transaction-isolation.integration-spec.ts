import { AuditEntityType, PrismaClient } from '@prisma/client'
import { ObjectId } from 'mongodb'
import { buildSuiteDatabaseUrl, validateTestEnvironment } from '../flows/lib/environment-guard'

const validated = validateTestEnvironment(process.env)

describe('Mongo test transaction isolation', () => {
  const prisma = new PrismaClient({ datasourceUrl: validated.databaseUrl })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('rolls back a failed transaction without leaving data behind', async () => {
    const entityId = new ObjectId().toHexString()
    const rollback = new Error('ROLLBACK_TEST_TRANSACTION')

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.auditLog.create({
          data: {
            entityType: AuditEntityType.SERIES,
            entityId,
            action: 'TEST_TRANSACTION_ROLLBACK'
          }
        })
        expect(await tx.auditLog.count({ where: { entityId } })).toBe(1)
        throw rollback
      })
    ).rejects.toBe(rollback)

    expect(await prisma.auditLog.count({ where: { entityId } })).toBe(0)
  })

  it('keeps two concurrently running suite databases isolated', async () => {
    const runId = `${process.pid}_${Date.now()}`
    const firstUrl = buildSuiteDatabaseUrl(validated.databaseUrl, `${runId}_first`)
    const secondUrl = buildSuiteDatabaseUrl(validated.databaseUrl, `${runId}_second`)
    const first = new PrismaClient({ datasourceUrl: firstUrl })
    const second = new PrismaClient({ datasourceUrl: secondUrl })
    const entityId = new ObjectId().toHexString()

    try {
      await Promise.all([
        first.auditLog.create({
          data: { entityType: AuditEntityType.SERIES, entityId, action: 'FIRST_SUITE' }
        }),
        second.auditLog.create({
          data: { entityType: AuditEntityType.SERIES, entityId, action: 'SECOND_SUITE' }
        })
      ])

      const [firstRows, secondRows] = await Promise.all([
        first.auditLog.findMany({ where: { entityId }, select: { action: true } }),
        second.auditLog.findMany({ where: { entityId }, select: { action: true } })
      ])
      expect(firstRows).toEqual([{ action: 'FIRST_SUITE' }])
      expect(secondRows).toEqual([{ action: 'SECOND_SUITE' }])
    } finally {
      await Promise.all([
        first.auditLog.deleteMany({ where: { entityId } }),
        second.auditLog.deleteMany({ where: { entityId } })
      ])
      await Promise.all([first.$disconnect(), second.$disconnect()])
    }
  })
})
