import { BoardQueryService } from './board-query.service'

const ID = '0123456789abcdef01234567'

describe('BoardQueryService', () => {
  it('rejects malformed session ids before repository access', async () => {
    const repository = { findSessionById: jest.fn() }
    const service = new BoardQueryService(repository as never)

    await expect(service.getSessionById('bad-id')).rejects.toMatchObject({ status: 404 })
    expect(repository.findSessionById).not.toHaveBeenCalled()
  })

  it('enriches session users through one batch query', async () => {
    const repository = {
      findManySessions: jest.fn().mockResolvedValue([
        {
          id: ID,
          creatorId: 'creator',
          allowedEditorIds: ['member'],
          title: 'Board',
          description: null,
          status: 'ACTIVE',
          phase: 'VOTING',
          startTime: new Date(),
          endTime: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]),
      findUsersMiniByIds: jest.fn().mockResolvedValue([
        { id: 'creator', name: 'Creator', displayName: null, avatar: null },
        { id: 'member', name: 'Member', displayName: 'Board Member', avatar: null }
      ])
    }
    const service = new BoardQueryService(repository as never)

    const result = await service.getSessions()

    expect(repository.findUsersMiniByIds).toHaveBeenCalledWith(['creator', 'member'])
    expect(result[0]).toMatchObject({
      creator: { id: 'creator', displayName: 'Creator' },
      members: [{ id: 'member', displayName: 'Board Member' }]
    })
  })

  it('returns a CONTRACT decision context with the effective decision roster', async () => {
    const repository = {
      findDecisionById: jest.fn().mockResolvedValue({
        id: ID,
        boardSessionId: '1123456789abcdef01234567',
        targetSeriesId: '2123456789abcdef01234567',
        decisionType: 'CONTRACT',
        result: 'APPROVED',
        details: {
          resourceType: 'PUBLICATION_CONTRACT',
          resourceId: '3123456789abcdef01234567',
          versionId: '4123456789abcdef01234567'
        },
        decidedAt: new Date(),
        allowedEditorIds: ['decision-member']
      }),
      findSessionById: jest.fn().mockResolvedValue({
        allowedEditorIds: ['session-member', 'decision-member']
      })
    }
    const service = new BoardQueryService(repository as never)

    await expect(service.getContractDecisionContext(ID)).resolves.toMatchObject({
      id: ID,
      decisionType: 'CONTRACT',
      result: 'APPROVED',
      allowedEditorIds: ['decision-member', 'session-member']
    })
  })

  it('finds only an approved CONTRACT decision matching resource type and id', async () => {
    const targetSeriesId = '2123456789abcdef01234567'
    const resourceId = '3123456789abcdef01234567'
    const repository = {
      findApprovedContractDecisions: jest.fn().mockResolvedValue([
        {
          id: ID,
          boardSessionId: '1123456789abcdef01234567',
          targetSeriesId,
          decisionType: 'CONTRACT',
          result: 'APPROVED',
          details: { resourceType: 'TRANSFER_CONTRACT', resourceId },
          allowedEditorIds: []
        }
      ]),
      findDecisionById: jest.fn().mockResolvedValue({
        id: ID,
        boardSessionId: '1123456789abcdef01234567',
        targetSeriesId,
        decisionType: 'CONTRACT',
        result: 'APPROVED',
        details: { resourceType: 'TRANSFER_CONTRACT', resourceId },
        allowedEditorIds: []
      }),
      findSessionById: jest.fn().mockResolvedValue({ allowedEditorIds: ['board-1'] })
    }
    const service = new BoardQueryService(repository as never)

    await expect(
      service.findApprovedContractDecisionContext({
        targetSeriesId,
        resourceType: 'TRANSFER_CONTRACT',
        resourceId
      })
    ).resolves.toMatchObject({ id: ID, allowedEditorIds: ['board-1'] })
  })
})
