import 'reflect-metadata'
import { ContractStatus } from '@prisma/client'
import { ContractService } from './contract.service'

describe('ContractService application boundary', () => {
  it('stays within the six-dependency facade limit', () => {
    const dependencies = Reflect.getMetadata('design:paramtypes', ContractService) as unknown[]
    expect(dependencies).toHaveLength(6)
  })

  it('preserves every public compatibility signature by delegating to focused use-case services', async () => {
    const query = {
      healthCheck: jest.fn().mockReturnValue({ status: 'OK', module: 'Contract' }),
      getContracts: jest.fn(),
      getContractById: jest.fn(),
      getContractVersions: jest.fn(),
      getContractVersionById: jest.fn()
    }
    const draft = {
      createDraft: jest.fn(),
      editorUpdateContract: jest.fn()
    }
    const workflow = {
      updateStatusByWorkflow: jest.fn(),
      sendToMangaka: jest.fn(),
      mangakaApprove: jest.fn(),
      mangakaRequestChanges: jest.fn(),
      boardApprove: jest.fn(),
      boardRequestChanges: jest.fn()
    }
    const signing = {
      signByMangakaWithOtp: jest.fn(),
      signByBoardWithOtp: jest.fn(),
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
    await service.updateStatusByWorkflow('contract', 'user', ContractStatus.MANGAKA_REVIEW)
    await service.sendToMangaka('contract', 'editor')
    await service.editorUpdateContract('contract', 'editor', {}, 'note')
    await service.mangakaApprove('contract', 'mangaka')
    await service.mangakaRequestChanges('contract', 'mangaka', 'reason')
    await service.boardApprove('contract', 'board')
    await service.boardRequestChanges('contract', 'board', 'reason')
    await service.signByMangakaWithOtp('contract', 'mangaka', 'm@example.test', '123456')
    await service.signByBoardWithOtp('contract', 'board', 'b@example.test', '123456')
    await service.checkContractStatus('contract', 'user', 'EDITOR')
    await service.reportRevenue('contract', 'user', 'EDITOR', { revenue: 100, period: '2026-07' })

    expect(query.getContracts).toHaveBeenCalledWith('user', 'EDITOR')
    expect(query.getContractById).toHaveBeenCalledWith('contract', 'user', 'EDITOR')
    expect(query.getContractVersions).toHaveBeenCalledWith('contract', 'user', 'EDITOR')
    expect(query.getContractVersionById).toHaveBeenCalledWith('contract', 'version', 'user', 'EDITOR')
    expect(pdf.exportPdf).toHaveBeenCalledWith('contract', 'user', 'EDITOR')
    expect(draft.createDraft).toHaveBeenCalledWith('editor', { seriesId: 'series' })
    expect(workflow.updateStatusByWorkflow).toHaveBeenCalledWith('contract', 'user', ContractStatus.MANGAKA_REVIEW)
    expect(workflow.sendToMangaka).toHaveBeenCalledWith('contract', 'editor')
    expect(draft.editorUpdateContract).toHaveBeenCalledWith('contract', 'editor', {}, 'note')
    expect(workflow.mangakaApprove).toHaveBeenCalledWith('contract', 'mangaka')
    expect(workflow.mangakaRequestChanges).toHaveBeenCalledWith('contract', 'mangaka', 'reason')
    expect(workflow.boardApprove).toHaveBeenCalledWith('contract', 'board')
    expect(workflow.boardRequestChanges).toHaveBeenCalledWith('contract', 'board', 'reason')
    expect(signing.signByMangakaWithOtp).toHaveBeenCalledWith('contract', 'mangaka', 'm@example.test', '123456')
    expect(signing.signByBoardWithOtp).toHaveBeenCalledWith('contract', 'board', 'b@example.test', '123456')
    expect(signing.checkContractStatus).toHaveBeenCalledWith('contract', 'user', 'EDITOR')
    expect(revenue.reportRevenue).toHaveBeenCalledWith('contract', 'user', 'EDITOR', {
      revenue: 100,
      period: '2026-07'
    })
  })
})
