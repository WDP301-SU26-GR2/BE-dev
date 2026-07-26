import { NameStatus } from '@prisma/client'
import { NameApprovalService } from './name-approval.service'

describe('NameApprovalService', () => {
  const name = {
    id: 'name-1',
    seriesId: 'series-1',
    chapterId: null,
    chapterNumber: null,
    kind: 'PROPOSAL',
    status: NameStatus.DRAFT,
    version: 1,
    pages: [],
    submittedAt: null
  }

  it('exposes the minimal approval query shape', async () => {
    const repository = { findNameById: jest.fn().mockResolvedValue(name) }
    const service = new NameApprovalService(repository as never)

    await expect(service.findApprovalById(name.id)).resolves.toEqual({ status: NameStatus.DRAFT })
  })

  it('owns proposal Name status mutations', async () => {
    const repository = {
      updateNameStatus: jest.fn().mockResolvedValue({
        ...name,
        status: NameStatus.SUBMITTED,
        submittedAt: new Date('2026-07-25T00:00:00.000Z')
      })
    }
    const service = new NameApprovalService(repository as never)

    await expect(service.submitProposalName(name.id)).resolves.toMatchObject({
      id: name.id,
      status: NameStatus.SUBMITTED,
      submittedAt: '2026-07-25T00:00:00.000Z'
    })
    await service.resetProposalNameToDraft(name.id)
    expect(repository.updateNameStatus).toHaveBeenLastCalledWith(name.id, { status: NameStatus.DRAFT })
  })
})
