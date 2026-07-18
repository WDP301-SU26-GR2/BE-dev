import { RevisionTargetType } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import { RevisionRepository } from './revision.repo'
import { RevisionService } from './revision.service'

const EDITOR = '507f1f77bcf86cd799439011'
const MANGAKA = '507f1f77bcf86cd799439012'
const OTHER = '507f1f77bcf86cd799439013'
const REV_ID = '507f1f77bcf86cd799439014'
const TARGET = '507f1f77bcf86cd799439015'
const RESOLVED_AT = new Date('2026-07-14T01:00:00Z')

const row = {
  id: REV_ID,
  targetType: RevisionTargetType.NAME,
  targetId: TARGET,
  seriesId: null,
  round: 1,
  reason: 'fix panel 3',
  requestedBy: EDITOR,
  recipientId: MANGAKA,
  isResolved: false,
  resolvedAt: null,
  resolvedBy: null,
  createdAt: new Date('2026-07-14T00:00:00Z')
}

const resolvedRow = {
  ...row,
  isResolved: true,
  resolvedAt: RESOLVED_AT,
  resolvedBy: MANGAKA
}

const makeDeps = () => ({
  repo: {
    create: jest.fn().mockResolvedValue(row),
    countByTarget: jest.fn().mockResolvedValue(0),
    countOpenByTarget: jest.fn().mockResolvedValue(0),
    findById: jest.fn().mockResolvedValueOnce(row).mockResolvedValue(resolvedRow),
    markResolvedIfOpen: jest.fn().mockResolvedValue({ count: 1 }),
    findMany: jest.fn().mockResolvedValue([row]),
    count: jest.fn().mockResolvedValue(1)
  },
  notification: { notifySafe: jest.fn().mockResolvedValue(undefined) }
})

const make = (deps: ReturnType<typeof makeDeps>) =>
  new RevisionService(deps.repo as unknown as RevisionRepository, deps.notification as unknown as NotificationService)

const openInput = {
  targetType: RevisionTargetType.NAME,
  targetId: TARGET,
  seriesId: null,
  reason: 'fix panel 3',
  requestedBy: EDITOR,
  recipientId: MANGAKA
}

describe('RevisionService.openSafe', () => {
  it('computes round = existing count + 1', async () => {
    const deps = makeDeps()
    deps.repo.countByTarget.mockResolvedValue(1)

    const result = await make(deps).openSafe(openInput)

    expect(result).toEqual({ round: 2 })
    expect(deps.repo.create).toHaveBeenCalledWith(expect.objectContaining({ round: 2, reason: 'fix panel 3' }))
  })

  it('NEVER throws when the DB write fails — still returns a round', async () => {
    const deps = makeDeps()
    deps.repo.countByTarget.mockResolvedValue(1)
    deps.repo.create.mockRejectedValue(new Error('mongo down'))

    await expect(make(deps).openSafe(openInput)).resolves.toEqual({ round: 2 })
  })

  it('NEVER throws when counting fails — falls back to round 1', async () => {
    const deps = makeDeps()
    deps.repo.countByTarget.mockRejectedValue(new Error('mongo down'))

    await expect(make(deps).openSafe(openInput)).resolves.toEqual({ round: 1 })
  })
})

describe('RevisionService.currentRound', () => {
  it('returns the number of rounds opened so far', async () => {
    const deps = makeDeps()
    deps.repo.countByTarget.mockResolvedValue(2)

    await expect(make(deps).currentRound(RevisionTargetType.NAME, TARGET)).resolves.toBe(2)
  })

  it('returns 0 when the DB errors (never throws)', async () => {
    const deps = makeDeps()
    deps.repo.countByTarget.mockRejectedValue(new Error('mongo down'))

    await expect(make(deps).currentRound(RevisionTargetType.NAME, TARGET)).resolves.toBe(0)
  })
})

describe('RevisionService.hasOpenRequest', () => {
  it('returns true when the repository counts open requests', async () => {
    const deps = makeDeps()
    deps.repo.countOpenByTarget.mockResolvedValue(2)
    await expect(make(deps).hasOpenRequest(RevisionTargetType.MANUSCRIPT, TARGET)).resolves.toBe(true)
    expect(deps.repo.countOpenByTarget).toHaveBeenCalledWith(RevisionTargetType.MANUSCRIPT, TARGET)
  })

  it('returns false when there are no open requests', async () => {
    const deps = makeDeps()
    await expect(make(deps).hasOpenRequest(RevisionTargetType.MANUSCRIPT, TARGET)).resolves.toBe(false)
  })

  it('fails open when the repository throws', async () => {
    const deps = makeDeps()
    deps.repo.countOpenByTarget.mockRejectedValue(new Error('db down'))
    await expect(make(deps).hasOpenRequest(RevisionTargetType.MANUSCRIPT, TARGET)).resolves.toBe(false)
  })
})

describe('RevisionService.resolve', () => {
  it('lets the recipient resolve and notifies the requester', async () => {
    const deps = makeDeps()

    const result = await make(deps).resolve(MANGAKA, REV_ID)

    expect(result.isResolved).toBe(true)
    expect(result.resolvedAt).toBe(RESOLVED_AT.toISOString())
    expect(deps.repo.markResolvedIfOpen).toHaveBeenCalledWith(REV_ID, MANGAKA)
    expect(deps.notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: EDITOR, referenceType: 'REVISION_RESOLVED', referenceId: REV_ID })
    )
  })

  it('rejects anyone who is not the recipient (403)', async () => {
    const deps = makeDeps()

    await expect(make(deps).resolve(OTHER, REV_ID)).rejects.toMatchObject({ status: 403 })
    expect(deps.repo.markResolvedIfOpen).not.toHaveBeenCalled()
  })

  it('is idempotent: resolving twice returns the row without a second write or notification', async () => {
    const deps = makeDeps()
    deps.repo.findById.mockReset().mockResolvedValue(resolvedRow)

    const result = await make(deps).resolve(MANGAKA, REV_ID)

    expect(result.isResolved).toBe(true)
    expect(deps.repo.markResolvedIfOpen).not.toHaveBeenCalled()
    expect(deps.notification.notifySafe).not.toHaveBeenCalled()
  })

  it('returns the winner result on the atomic loser path without rewriting or notifying', async () => {
    const deps = makeDeps()
    deps.repo.markResolvedIfOpen.mockResolvedValue({ count: 0 })

    const result = await make(deps).resolve(MANGAKA, REV_ID)

    expect(result).toEqual(expect.objectContaining({ isResolved: true, resolvedAt: RESOLVED_AT.toISOString() }))
    expect(deps.repo.markResolvedIfOpen).toHaveBeenCalledTimes(1)
    expect(deps.notification.notifySafe).not.toHaveBeenCalled()
  })

  it('allows only one concurrent resolver to notify', async () => {
    const deps = makeDeps()
    deps.repo.findById.mockReset().mockResolvedValueOnce(row).mockResolvedValueOnce(row).mockResolvedValue(resolvedRow)
    deps.repo.markResolvedIfOpen.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    const service = make(deps)

    const results = await Promise.all([service.resolve(MANGAKA, REV_ID), service.resolve(MANGAKA, REV_ID)])

    expect(results).toEqual([
      expect.objectContaining({ isResolved: true }),
      expect.objectContaining({ isResolved: true })
    ])
    expect(deps.repo.markResolvedIfOpen).toHaveBeenCalledTimes(2)
    expect(deps.notification.notifySafe).toHaveBeenCalledTimes(1)
  })

  it('returns 404 for a malformed id without hitting Prisma', async () => {
    const deps = makeDeps()

    await expect(make(deps).resolve(MANGAKA, 'bad-id')).rejects.toMatchObject({ status: 404 })
    expect(deps.repo.findById).not.toHaveBeenCalled()
  })

  it('returns 404 for a valid but missing id', async () => {
    const deps = makeDeps()
    deps.repo.findById.mockReset().mockResolvedValue(null)

    await expect(make(deps).resolve(MANGAKA, REV_ID)).rejects.toMatchObject({ status: 404 })
    expect(deps.repo.markResolvedIfOpen).not.toHaveBeenCalled()
  })
})

describe('RevisionService.list', () => {
  it('scopes non-privileged callers to rows they requested or must fix', async () => {
    const deps = makeDeps()

    await make(deps).list({ userId: MANGAKA, roleName: 'MANGAKA' }, { limit: 20, offset: 0 })

    expect(deps.repo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ OR: [{ recipientId: MANGAKA }, { requestedBy: MANGAKA }] }),
      { limit: 20, offset: 0 }
    )
  })

  it.each(['SUPER_ADMIN', 'BOARD_MEMBER'])('does not scope privileged caller %s', async (roleName) => {
    const deps = makeDeps()

    await make(deps).list({ userId: OTHER, roleName }, { limit: 20, offset: 0 })

    const where = deps.repo.findMany.mock.calls[0][0]
    expect(where.OR).toBeUndefined()
  })

  it('returns an empty page for a malformed targetId (no 500)', async () => {
    const deps = makeDeps()

    const result = await make(deps).list(
      { userId: MANGAKA, roleName: 'MANGAKA' },
      { targetId: 'bad-id', limit: 20, offset: 0 }
    )

    expect(result).toEqual({ items: [], total: 0, limit: 20, offset: 0 })
    expect(deps.repo.findMany).not.toHaveBeenCalled()
    expect(deps.repo.count).not.toHaveBeenCalled()
  })

  it('treats an explicitly empty targetId as malformed and returns an empty page', async () => {
    const deps = makeDeps()

    const result = await make(deps).list(
      { userId: MANGAKA, roleName: 'MANGAKA' },
      { targetId: '', limit: 20, offset: 0 }
    )

    expect(result).toEqual({ items: [], total: 0, limit: 20, offset: 0 })
    expect(deps.repo.findMany).not.toHaveBeenCalled()
    expect(deps.repo.count).not.toHaveBeenCalled()
  })
})
