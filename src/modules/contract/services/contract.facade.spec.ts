import 'reflect-metadata'
import { ContractService } from './contract.service'

describe('ContractService application boundary', () => {
  it('keeps the facade as a thin delegator to focused use-case services', () => {
    const dependencies = Reflect.getMetadata('design:paramtypes', ContractService) as unknown[]
    expect(dependencies).toHaveLength(6)
  })

  it('preserves the current public compatibility signatures by delegating to focused services', async () => {
    const query = {
      healthCheck: jest.fn().mockReturnValue({ status: 'OK', module: 'Contract' }),
      getContracts: jest.fn(),
      getContractById: jest.fn(),
      getContractVersions: jest.fn(),
      getContractVersionById: jest.fn()
    }
    const draft = {
      createDraft: jest.fn(),
      editorUpdateContract: jest.fn(),
      redraft: jest.fn()
    }
    const workflow = {
      submitForReview: jest.fn(),
      claimRepresentative: jest.fn(),
      releaseRepresentative: jest.fn(),
      assignRepresentative: jest.fn(),
      addComment: jest.fn(),
      listComments: jest.fn()
    }
    const signing = {
      signByMangakaWithOtp: jest.fn(),
      signByRepresentativeWithOtp: jest.fn(),
      rejectByMangaka: jest.fn(),
      checkContractStatus: jest.fn()
    }
    const pdf = { exportPdf: jest.fn() }
    const revenue = { reportRevenue: jest.fn() }
    const service = new ContractService(
      query as never,
      draft as never,
      workflow as never,
      signing as never,
      pdf as never,
      revenue as never
    )

    expect(service.healthCheck()).toEqual({ status: 'OK', module: 'Contract' })
    await service.getContracts('user', 'EDITOR')
    await service.getContractById('contract', 'user', 'EDITOR')
    await service.getContractVersions('contract', 'user', 'EDITOR')
    await service.getContractVersionById('contract', 'version', 'user', 'EDITOR')
    await service.exportPdf('contract', 'user', 'EDITOR')
    await service.createDraft('editor', { seriesId: 'series' } as never)
    await service.submitForReview('contract', 'editor')
    await service.editorUpdateContract('contract', 'editor', {}, 'note')
    await service.claimRepresentative('contract', 'board')
    await service.releaseRepresentative('contract', 'board')
    await service.assignRepresentative('contract', 'admin', { representativeId: 'board' })
    await service.addComment('contract', 'board', { content: 'LGTM' })
    await service.listComments('contract', 'user', 'EDITOR')
    await service.signByRepresentativeWithOtp('contract', 'board', 'b@example.test', '123456')
    await service.signByMangakaWithOtp('contract', 'mangaka', 'm@example.test', '123456')
    await service.rejectByMangaka('contract', 'mangaka', { reason: 'price' })
    await service.redraft('contract', 'editor')
    await service.checkContractStatus('contract', 'user', 'EDITOR')
    await service.reportRevenue('contract', 'user', 'EDITOR', { revenue: 100, period: '2026-07' })

    expect(query.getContracts).toHaveBeenCalledWith('user', 'EDITOR')
    expect(query.getContractById).toHaveBeenCalledWith('contract', 'user', 'EDITOR')
    expect(query.getContractVersions).toHaveBeenCalledWith('contract', 'user', 'EDITOR')
    expect(query.getContractVersionById).toHaveBeenCalledWith('contract', 'version', 'user', 'EDITOR')
    expect(pdf.exportPdf).toHaveBeenCalledWith('contract', 'user', 'EDITOR')
    expect(draft.createDraft).toHaveBeenCalledWith('editor', { seriesId: 'series' })
    expect(workflow.submitForReview).toHaveBeenCalledWith('contract', 'editor')
    expect(draft.editorUpdateContract).toHaveBeenCalledWith('contract', 'editor', {}, 'note')
    expect(workflow.claimRepresentative).toHaveBeenCalledWith('contract', 'board')
    expect(workflow.releaseRepresentative).toHaveBeenCalledWith('contract', 'board')
    expect(workflow.assignRepresentative).toHaveBeenCalledWith('contract', 'admin', { representativeId: 'board' })
    expect(workflow.addComment).toHaveBeenCalledWith('contract', 'board', { content: 'LGTM' })
    expect(workflow.listComments).toHaveBeenCalledWith('contract', 'user', 'EDITOR')
    expect(signing.signByRepresentativeWithOtp).toHaveBeenCalledWith('contract', 'board', 'b@example.test', '123456')
    expect(signing.signByMangakaWithOtp).toHaveBeenCalledWith('contract', 'mangaka', 'm@example.test', '123456')
    expect(signing.rejectByMangaka).toHaveBeenCalledWith('contract', 'mangaka', 'price')
    expect(draft.redraft).toHaveBeenCalledWith('contract', 'editor')
    expect(signing.checkContractStatus).toHaveBeenCalledWith('contract', 'user', 'EDITOR')
    expect(revenue.reportRevenue).toHaveBeenCalledWith('contract', 'user', 'EDITOR', {
      revenue: 100,
      period: '2026-07'
    })
  })
})
