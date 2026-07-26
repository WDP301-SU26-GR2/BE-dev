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
})
