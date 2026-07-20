import { SeriesStatus } from '@prisma/client'
import { SeriesMetadataConflictException, SeriesNotEditableException } from '../errors/series.errors'
import { SeriesMetadataService } from './series-metadata.service'
import { asCacheService, makeCacheServiceMock } from 'src/infrastructure/redis/cache.service.mock'

const MANGAKA = '507f1f77bcf86cd799439011'
const EDITOR = '507f1f77bcf86cd799439012'
const OTHER = '507f1f77bcf86cd799439013'
const SERIES_ID = '507f1f77bcf86cd799439014'

const baseSeries = {
  id: SERIES_ID,
  mangakaId: MANGAKA,
  editorId: EDITOR,
  status: SeriesStatus.SERIALIZED,
  title: 'Old',
  coverImage: null,
  genres: [],
  demographic: null,
  publicationType: null,
  magazine: null,
  startIssueNumber: null,
  statusReason: null,
  relationshipType: null,
  franchiseConsentStatus: null,
  coOwnerId: null,
  parentSeriesId: null,
  reviewStartedAt: null,
  completionProposal: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  proposal: {
    nameId: '507f1f77bcf86cd799439015',
    synopsis: 'old synopsis',
    characterDesigns: ['k1'],
    estimatedLength: 20,
    status: 'PROPOSAL_APPROVED',
    createdAt: new Date('2026-01-01T00:00:00Z')
  }
}

const makeDeps = (series: any = baseSeries) => ({
  repo: {
    findById: jest.fn().mockResolvedValue(series),
    updateSeriesMetadata: jest.fn().mockResolvedValue({
      outcome: 'UPDATED',
      series: { ...baseSeries, title: 'New' },
      changedFields: ['title', 'characterDesigns']
    })
  },
  audit: { record: jest.fn().mockResolvedValue(undefined) },
  notification: { notifySafe: jest.fn().mockResolvedValue(undefined) }
})

const make = (deps: ReturnType<typeof makeDeps>) =>
  new SeriesMetadataService(
    deps.repo as never,
    deps.audit as never,
    deps.notification as never,
    asCacheService(makeCacheServiceMock())
  )

describe('SeriesMetadataService.update', () => {
  it('lets the owning mangaka patch metadata and records an audit entry after the write', async () => {
    const deps = makeDeps()

    const result = await make(deps).update({ userId: MANGAKA, roleName: 'MANGAKA' }, SERIES_ID, {
      title: 'New',
      characterDesigns: []
    })

    expect(result.title).toBe('New')
    expect(deps.repo.updateSeriesMetadata).toHaveBeenCalledWith(
      SERIES_ID,
      { title: 'New', characterDesigns: [] },
      expect.objectContaining({ authorization: { kind: 'OWNER', userId: MANGAKA } })
    )
    expect(deps.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: MANGAKA,
        entityType: 'SERIES',
        entityId: SERIES_ID,
        action: 'METADATA_UPDATED',
        reason: 'title,characterDesigns'
      })
    )
    expect(deps.repo.updateSeriesMetadata.mock.invocationCallOrder[0]).toBeLessThan(
      deps.audit.record.mock.invocationCallOrder[0]
    )
  })

  it('lets the assigned editor patch and notifies the mangaka', async () => {
    const deps = makeDeps()
    deps.repo.updateSeriesMetadata.mockResolvedValue({
      outcome: 'UPDATED',
      series: { ...baseSeries, proposal: { ...baseSeries.proposal, synopsis: 'New synopsis' } },
      changedFields: ['synopsis']
    })

    await make(deps).update({ userId: EDITOR, roleName: 'EDITOR' }, SERIES_ID, { synopsis: 'New synopsis' })

    expect(deps.notification.notifySafe).toHaveBeenCalledWith({
      recipientId: MANGAKA,
      type: 'SYSTEM',
      referenceId: SERIES_ID,
      referenceType: 'SERIES_METADATA_UPDATED',
      content: 'Đã cập nhật thông tin series: synopsis'
    })
  })

  it('notifies the assigned editor when the owning mangaka patches metadata', async () => {
    const deps = makeDeps()
    deps.repo.updateSeriesMetadata.mockResolvedValue({
      outcome: 'UPDATED',
      series: { ...baseSeries, coverImage: '' },
      changedFields: ['coverImage']
    })

    await make(deps).update({ userId: MANGAKA, roleName: 'MANGAKA' }, SERIES_ID, { coverImage: '' })

    expect(deps.notification.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: EDITOR, content: 'Đã cập nhật thông tin series: coverImage' })
    )
  })

  it('returns the current series without writing, auditing, or notifying for an all-null/no-op patch', async () => {
    const deps = makeDeps()
    deps.repo.updateSeriesMetadata.mockResolvedValue({ outcome: 'UNCHANGED', series: baseSeries })

    const result = await make(deps).update({ userId: MANGAKA, roleName: 'MANGAKA' }, SERIES_ID, {
      coverImage: null,
      synopsis: null,
      characterDesigns: null
    })

    expect(result.title).toBe('Old')
    expect(deps.repo.updateSeriesMetadata).toHaveBeenCalled()
    expect(deps.audit.record).not.toHaveBeenCalled()
    expect(deps.notification.notifySafe).not.toHaveBeenCalled()
  })

  it('does not write or emit side effects when submitted values already equal the current metadata', async () => {
    const deps = makeDeps()
    deps.repo.updateSeriesMetadata.mockResolvedValue({ outcome: 'UNCHANGED', series: baseSeries })

    await make(deps).update({ userId: MANGAKA, roleName: 'MANGAKA' }, SERIES_ID, {
      title: 'Old',
      synopsis: 'old synopsis',
      characterDesigns: ['k1']
    })

    expect(deps.repo.updateSeriesMetadata).toHaveBeenCalled()
    expect(deps.audit.record).not.toHaveBeenCalled()
    expect(deps.notification.notifySafe).not.toHaveBeenCalled()
  })

  it('rejects a caller who is neither the owner nor assigned editor', async () => {
    const deps = makeDeps()

    await expect(
      make(deps).update({ userId: OTHER, roleName: 'MANGAKA' }, SERIES_ID, { title: 'New' })
    ).rejects.toMatchObject({ status: 403 })
    expect(deps.repo.updateSeriesMetadata).not.toHaveBeenCalled()
  })

  it.each([
    SeriesStatus.COMPLETED,
    SeriesStatus.CANCELLED,
    SeriesStatus.ABANDONED,
    SeriesStatus.WITHDRAWN,
    SeriesStatus.REJECTED
  ])('rejects terminal status %s with 409 Error.SeriesNotEditable', async (status) => {
    const deps = makeDeps({ ...baseSeries, status })

    await expect(make(deps).update({ userId: MANGAKA, roleName: 'MANGAKA' }, SERIES_ID, { title: 'New' })).rejects.toBe(
      SeriesNotEditableException
    )
    expect(deps.repo.updateSeriesMetadata).not.toHaveBeenCalled()
  })

  it('returns 404 for a malformed series id without querying Prisma', async () => {
    const deps = makeDeps()

    await expect(
      make(deps).update({ userId: MANGAKA, roleName: 'MANGAKA' }, 'not-an-objectid', { title: 'New' })
    ).rejects.toMatchObject({ status: 404 })
    expect(deps.repo.findById).not.toHaveBeenCalled()
  })

  it('returns 404 when the series does not exist', async () => {
    const deps = makeDeps(null)

    await expect(
      make(deps).update({ userId: MANGAKA, roleName: 'MANGAKA' }, SERIES_ID, { title: 'New' })
    ).rejects.toMatchObject({ status: 404 })
    expect(deps.repo.updateSeriesMetadata).not.toHaveBeenCalled()
  })

  it('returns 409 without side effects when the repository loses a race to a terminal transition', async () => {
    const deps = makeDeps()
    deps.repo.updateSeriesMetadata.mockResolvedValue({
      outcome: 'GUARD_MISMATCH',
      series: { ...baseSeries, status: SeriesStatus.CANCELLED }
    })

    await expect(
      make(deps).update({ userId: MANGAKA, roleName: 'MANGAKA' }, SERIES_ID, { title: 'Too late' })
    ).rejects.toMatchObject({ status: 409 })
    expect(deps.audit.record).not.toHaveBeenCalled()
    expect(deps.notification.notifySafe).not.toHaveBeenCalled()
  })

  it('returns 403 without side effects when an editor is reassigned before the guarded write', async () => {
    const deps = makeDeps()
    deps.repo.updateSeriesMetadata.mockResolvedValue({
      outcome: 'GUARD_MISMATCH',
      series: { ...baseSeries, editorId: OTHER }
    })

    await expect(
      make(deps).update({ userId: EDITOR, roleName: 'EDITOR' }, SERIES_ID, { synopsis: 'stale edit' })
    ).rejects.toMatchObject({ status: 403 })
    expect(deps.audit.record).not.toHaveBeenCalled()
    expect(deps.notification.notifySafe).not.toHaveBeenCalled()
  })

  it('does not emit side effects when a conflict retry becomes a no-op', async () => {
    const deps = makeDeps()
    deps.repo.updateSeriesMetadata.mockResolvedValue({
      outcome: 'UNCHANGED',
      series: { ...baseSeries, proposal: { ...baseSeries.proposal, synopsis: 'desired' } }
    })

    const result = await make(deps).update({ userId: MANGAKA, roleName: 'MANGAKA' }, SERIES_ID, {
      synopsis: 'desired'
    })

    expect(result.proposal?.synopsis).toBe('desired')
    expect(deps.audit.record).not.toHaveBeenCalled()
    expect(deps.notification.notifySafe).not.toHaveBeenCalled()
  })

  it('maps only exhausted metadata CAS retries to Error.SeriesMetadataConflict without side effects', async () => {
    const deps = makeDeps()
    deps.repo.updateSeriesMetadata.mockResolvedValue({ outcome: 'RETRY_EXHAUSTED', series: baseSeries })

    await expect(
      make(deps).update({ userId: MANGAKA, roleName: 'MANGAKA' }, SERIES_ID, { synopsis: 'contended edit' })
    ).rejects.toBe(SeriesMetadataConflictException)
    expect(SeriesMetadataConflictException.getResponse()).toEqual({
      message: [{ message: 'Error.SeriesMetadataConflict', path: 'metadata' }],
      error: 'Conflict',
      statusCode: 409
    })
    expect(deps.audit.record).not.toHaveBeenCalled()
    expect(deps.notification.notifySafe).not.toHaveBeenCalled()
  })
})
