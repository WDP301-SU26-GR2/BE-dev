import { AuditEntityType } from '@prisma/client'
import { AuditService } from './audit.service'

const ENTITY_ID = 'a'.repeat(24)
const ACTOR_ID = 'b'.repeat(24)

function makeRepo(over: Record<string, unknown> = {}) {
  return {
    create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    ...over
  }
}

const input = {
  actorId: ACTOR_ID,
  entityType: AuditEntityType.SERIES,
  entityId: ENTITY_ID,
  action: 'TRANSITION',
  fromState: 'DRAFT',
  toState: 'IN_REVIEW'
}

describe('AuditService.record', () => {
  it('writes a record in the central audit shape', async () => {
    const repo = makeRepo()
    const svc = new AuditService(repo as never)

    await svc.record(input)

    expect(repo.create).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      entityType: AuditEntityType.SERIES,
      entityId: ENTITY_ID,
      action: 'TRANSITION',
      fromState: 'DRAFT',
      toState: 'IN_REVIEW',
      reason: null
    })
  })

  it('never throws when repo fails', async () => {
    const repo = makeRepo({ create: jest.fn().mockRejectedValue(new Error('db down')) })
    const svc = new AuditService(repo as never)

    await expect(svc.record(input)).resolves.toBeUndefined()
  })

  it('skips malformed entityId without hitting repo', async () => {
    const repo = makeRepo()
    const svc = new AuditService(repo as never)

    await svc.record({ ...input, entityId: 'garbage' })

    expect(repo.create).not.toHaveBeenCalled()
  })
})

describe('AuditService.query', () => {
  it('filters by entityType and entityId', async () => {
    const repo = makeRepo()
    const svc = new AuditService(repo as never)

    await svc.query({ entityType: AuditEntityType.SERIES, entityId: ENTITY_ID, limit: 20, offset: 0 })

    expect(repo.findMany).toHaveBeenCalledWith(
      { entityType: AuditEntityType.SERIES, entityId: ENTITY_ID },
      {
        limit: 20,
        offset: 0
      }
    )
  })

  it('maps audit rows to response DTO shape', async () => {
    const createdAt = new Date('2026-01-02T03:04:05.000Z')
    const repo = makeRepo({
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'audit-1',
          actorId: ACTOR_ID,
          entityType: AuditEntityType.SERIES,
          entityId: ENTITY_ID,
          action: 'TRANSITION',
          fromState: 'DRAFT',
          toState: 'IN_REVIEW',
          reason: null,
          createdAt
        }
      ]),
      count: jest.fn().mockResolvedValue(1)
    })
    const svc = new AuditService(repo as never)

    await expect(svc.query({ limit: 20, offset: 0 })).resolves.toEqual({
      items: [
        {
          id: 'audit-1',
          actorId: ACTOR_ID,
          entityType: AuditEntityType.SERIES,
          entityId: ENTITY_ID,
          action: 'TRANSITION',
          fromState: 'DRAFT',
          toState: 'IN_REVIEW',
          reason: null,
          createdAt: createdAt.toISOString()
        }
      ],
      total: 1,
      limit: 20,
      offset: 0
    })
  })

  it('malformed ObjectId filters return an empty result without querying', async () => {
    const repo = makeRepo()
    const svc = new AuditService(repo as never)

    await expect(svc.query({ entityId: 'garbage', limit: 20, offset: 0 })).resolves.toEqual({
      items: [],
      total: 0,
      limit: 20,
      offset: 0
    })
    await expect(svc.query({ actorId: 'garbage', limit: 20, offset: 0 })).resolves.toMatchObject({ total: 0 })
    expect(repo.findMany).not.toHaveBeenCalled()
    expect(repo.count).not.toHaveBeenCalled()
  })
})
