import { RevisionRequest, RevisionTargetType } from '@prisma/client'
import { toRevisionRequestRes } from './revision.mapper'

describe('toRevisionRequestRes', () => {
  it('maps Prisma dates to ISO strings and preserves nullable fields', () => {
    const row: RevisionRequest = {
      id: '507f1f77bcf86cd799439014',
      targetType: RevisionTargetType.PROPOSAL,
      targetId: '507f1f77bcf86cd799439015',
      seriesId: '507f1f77bcf86cd799439015',
      round: 2,
      reason: 'fix the dialogue',
      requestedBy: '507f1f77bcf86cd799439011',
      recipientId: '507f1f77bcf86cd799439012',
      isResolved: false,
      resolvedAt: null,
      resolvedBy: null,
      createdAt: new Date('2026-07-14T10:20:30.000Z')
    }

    expect(toRevisionRequestRes(row)).toEqual(
      expect.objectContaining({
        createdAt: '2026-07-14T10:20:30.000Z',
        resolvedAt: null,
        resolvedBy: null
      })
    )
  })

  it('serializes resolvedAt when present', () => {
    const row: RevisionRequest = {
      id: '507f1f77bcf86cd799439014',
      targetType: RevisionTargetType.TASK,
      targetId: '507f1f77bcf86cd799439015',
      seriesId: null,
      round: 1,
      reason: 'fix the tones',
      requestedBy: '507f1f77bcf86cd799439011',
      recipientId: '507f1f77bcf86cd799439012',
      isResolved: true,
      resolvedAt: new Date('2026-07-14T11:22:33.000Z'),
      resolvedBy: '507f1f77bcf86cd799439012',
      createdAt: new Date('2026-07-14T10:20:30.000Z')
    }

    expect(toRevisionRequestRes(row).resolvedAt).toBe('2026-07-14T11:22:33.000Z')
  })
})
