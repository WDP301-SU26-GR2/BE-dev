/* eslint-disable @typescript-eslint/unbound-method */
import { Test } from '@nestjs/testing'
import { ContractAmendmentService } from './contract-amendment.service'
import { ContractAmendmentRepo } from '../contract-amendment.repo'
import { ContractRepo } from '../contract.repo'
import { AuthOtpService } from 'src/modules/auth/services/auth-otp.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { AuditService } from 'src/modules/audit/audit.service'
import { RoleName } from 'src/core/security/constants/role.constant'

const EDITOR = '64a000000000000000000001'
const MANGAKA = '64a000000000000000000002'
const CONTRACT = '64a000000000000000000010'

const makeContract = (over: Partial<any> = {}): any => {
  return {
    id: CONTRACT,
    editorId: EDITOR,
    mangakaId: MANGAKA,
    contractType: 'REVENUE_SHARE',
    status: 'FULLY_EXECUTED',
    boardDecisionId: '64a000000000000000000099',
    versions: [],
    ...over
  }
}

describe('ContractAmendmentService', () => {
  let service: ContractAmendmentService
  let amendmentRepo: jest.Mocked<ContractAmendmentRepo>
  let contractRepo: jest.Mocked<ContractRepo>

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        ContractAmendmentService,
        {
          provide: ContractAmendmentRepo,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            findManyByContract: jest.fn(),
            findOpenByContract: jest.fn(),
            update: jest.fn(),
            clearSignatures: jest.fn(),
            countBoardSignatures: jest.fn(),
            findSignature: jest.fn(),
            addBoardSignature: jest.fn(),
            executeAndApply: jest.fn()
          }
        },
        { provide: ContractRepo, useValue: { findById: jest.fn(), findWithBoardDecision: jest.fn() } },
        { provide: AuthOtpService, useValue: { validateOtpCode: jest.fn() } },
        { provide: NotificationService, useValue: { notifySafe: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } }
      ]
    }).compile()
    service = mod.get(ContractAmendmentService)
    amendmentRepo = mod.get(ContractAmendmentRepo)
    contractRepo = mod.get(ContractRepo)
  })

  describe('create', () => {
    it('rejects when contract not FULLY_EXECUTED', async () => {
      contractRepo.findById.mockResolvedValue(makeContract({ status: 'MANGAKA_SIGNED' }))
      await expect(service.create(CONTRACT, EDITOR, { changedClauses: ['x'] } as any)).rejects.toMatchObject({
        status: 409,
        response: {
          message: expect.arrayContaining([
            expect.objectContaining({ message: expect.stringContaining('ContractNotAmendable') })
          ])
        }
      })
    })

    it('rejects when caller is not the assigned editor', async () => {
      contractRepo.findById.mockResolvedValue(makeContract())
      await expect(
        service.create(CONTRACT, 'someone-else-000000000000', { changedClauses: ['x'] } as any)
      ).rejects.toMatchObject({ status: 403 })
    })

    it('rejects when an open amendment already exists', async () => {
      contractRepo.findById.mockResolvedValue(makeContract())
      amendmentRepo.findOpenByContract.mockResolvedValue({ id: 'open' } as any)
      await expect(service.create(CONTRACT, EDITOR, { changedClauses: ['x'] } as any)).rejects.toMatchObject({
        status: 409,
        response: {
          message: expect.arrayContaining([
            expect.objectContaining({ message: expect.stringContaining('OpenAmendmentExists') })
          ])
        }
      })
    })

    it('rejects malformed contractId with 404 (no P2023)', async () => {
      await expect(service.create('not-hex', EDITOR, { changedClauses: ['x'] } as any)).rejects.toMatchObject({
        status: 404
      })
    })

    it('creates DRAFT amendment with createdBy + MANUAL trigger', async () => {
      contractRepo.findById.mockResolvedValue(makeContract())
      amendmentRepo.findOpenByContract.mockResolvedValue(null)
      amendmentRepo.create.mockResolvedValue({ id: 'am1', status: 'DRAFT' } as any)
      await service.create(CONTRACT, EDITOR, { changedClauses: ['bump valuation'], valuationAmount: 500 })
      expect(amendmentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ contractId: CONTRACT, createdBy: EDITOR, triggerSource: 'MANUAL', status: 'DRAFT' })
      )
    })
  })

  describe('list', () => {
    it('rejects malformed contractId with 404', async () => {
      await expect(service.list('not-hex', EDITOR, RoleName.EDITOR)).rejects.toMatchObject({ status: 404 })
    })

    it('rejects when contract not found with 404', async () => {
      contractRepo.findById.mockResolvedValue(null)
      await expect(service.list(CONTRACT, EDITOR, RoleName.EDITOR)).rejects.toMatchObject({ status: 404 })
    })

    it('rejects when caller cannot view contract', async () => {
      contractRepo.findById.mockResolvedValue(makeContract())
      await expect(service.list(CONTRACT, 'stranger', RoleName.EDITOR)).rejects.toMatchObject({ status: 403 })
    })

    it('returns amendments for authorized viewer', async () => {
      const amendments = [{ id: 'a1' }, { id: 'a2' }]
      contractRepo.findById.mockResolvedValue(makeContract())
      amendmentRepo.findManyByContract.mockResolvedValue(amendments as any)
      const result = await service.list(CONTRACT, EDITOR, RoleName.EDITOR)
      expect(result).toEqual(amendments)
    })

    it('allows BOARD_MEMBER to view any contract amendments', async () => {
      const amendments = [{ id: 'a1' }]
      contractRepo.findById.mockResolvedValue(makeContract())
      amendmentRepo.findManyByContract.mockResolvedValue(amendments as any)
      const result = await service.list(CONTRACT, 'any-board-member', RoleName.BOARD_MEMBER)
      expect(result).toEqual(amendments)
    })
  })

  describe('detail', () => {
    it('rejects malformed contractId or amendment id with 404', async () => {
      await expect(
        service.detail('not-hex', '64a000000000000000000003', EDITOR, RoleName.EDITOR)
      ).rejects.toMatchObject({
        status: 404
      })
      await expect(service.detail(CONTRACT, 'not-hex', EDITOR, RoleName.EDITOR)).rejects.toMatchObject({
        status: 404
      })
    })

    it('rejects when contract not found with 404', async () => {
      contractRepo.findById.mockResolvedValue(null)
      await expect(service.detail(CONTRACT, '64a000000000000000000003', EDITOR, RoleName.EDITOR)).rejects.toMatchObject(
        {
          status: 404
        }
      )
    })

    it('rejects when caller cannot view contract', async () => {
      contractRepo.findById.mockResolvedValue(makeContract())
      await expect(
        service.detail(CONTRACT, '64a000000000000000000003', 'stranger', RoleName.EDITOR)
      ).rejects.toMatchObject({
        status: 403
      })
    })

    it('rejects when amendment not found', async () => {
      contractRepo.findById.mockResolvedValue(makeContract())
      amendmentRepo.findById.mockResolvedValue(null)
      await expect(service.detail(CONTRACT, '64a000000000000000000003', EDITOR, RoleName.EDITOR)).rejects.toMatchObject(
        {
          status: 404
        }
      )
    })

    it('rejects when amendment belongs to different contract', async () => {
      contractRepo.findById.mockResolvedValue(makeContract())
      amendmentRepo.findById.mockResolvedValue({ id: 'a1', contractId: 'different-contract' } as any)
      await expect(service.detail(CONTRACT, '64a000000000000000000003', EDITOR, RoleName.EDITOR)).rejects.toMatchObject(
        {
          status: 404
        }
      )
    })

    it('returns amendment for authorized viewer', async () => {
      const amendment = { id: 'a1', contractId: CONTRACT }
      contractRepo.findById.mockResolvedValue(makeContract())
      amendmentRepo.findById.mockResolvedValue(amendment as any)
      const result = await service.detail(CONTRACT, '64a000000000000000000003', EDITOR, RoleName.EDITOR)
      expect(result).toEqual(amendment)
    })
  })

  describe('update + submit', () => {
    const AM = '64a000000000000000000003'

    it('patch only when DRAFT then clears signatures', async () => {
      amendmentRepo.findById.mockResolvedValue({ id: AM, contractId: CONTRACT, status: 'DRAFT' } as any)
      contractRepo.findById.mockResolvedValue(makeContract())
      amendmentRepo.update.mockResolvedValue({ id: AM } as any)
      await service.update(CONTRACT, AM, EDITOR, { valuationAmount: 999 })
      expect(amendmentRepo.clearSignatures).toHaveBeenCalledWith(AM)
    })

    it('patch rejects when not DRAFT', async () => {
      amendmentRepo.findById.mockResolvedValue({ id: AM, contractId: CONTRACT, status: 'PENDING_SIGNATURES' } as any)
      contractRepo.findById.mockResolvedValue(makeContract())
      await expect(service.update(CONTRACT, AM, EDITOR, { valuationAmount: 1 } as any)).rejects.toMatchObject({
        status: 409,
        response: {
          message: expect.arrayContaining([
            expect.objectContaining({ message: expect.stringContaining('AmendmentNotEditable') })
          ])
        }
      })
    })

    it('submit rejects when no term changed', async () => {
      amendmentRepo.findById.mockResolvedValue({
        id: AM,
        contractId: CONTRACT,
        status: 'DRAFT',
        changedClauses: ['x'],
        valuationAmount: null,
        publisherOwnershipPct: null,
        mangakaOwnershipPct: null,
        terminationClause: null,
        contractStart: null,
        contractEnd: null
      } as any)
      contractRepo.findById.mockResolvedValue(makeContract())
      await expect(service.submit(CONTRACT, AM, EDITOR)).rejects.toMatchObject({
        status: 422,
        response: {
          message: expect.arrayContaining([
            expect.objectContaining({ message: expect.stringContaining('AmendmentNoChanges') })
          ])
        }
      })
    })

    it('submit moves DRAFT → PENDING_SIGNATURES', async () => {
      amendmentRepo.findById.mockResolvedValue({
        id: AM,
        contractId: CONTRACT,
        status: 'DRAFT',
        changedClauses: ['x'],
        valuationAmount: 500,
        publisherOwnershipPct: null,
        mangakaOwnershipPct: null,
        terminationClause: null,
        contractStart: null,
        contractEnd: null
      } as any)
      contractRepo.findById.mockResolvedValue(makeContract())
      amendmentRepo.update.mockResolvedValue({ id: AM, status: 'PENDING_SIGNATURES' } as any)
      await service.submit(CONTRACT, AM, EDITOR)
      expect(amendmentRepo.update).toHaveBeenCalledWith(AM, expect.objectContaining({ status: 'PENDING_SIGNATURES' }))
    })
  })

  describe('signing', () => {
    const boardCtx = (): any => ({
      id: CONTRACT,
      mangakaId: MANGAKA,
      contractType: 'REVENUE_SHARE',
      boardDecision: { boardSession: { allowedEditorIds: ['b1', 'b2'] } }
    })

    it('mangaka sign rejected for FULL_BUYOUT', async () => {
      amendmentRepo.findById.mockResolvedValue({
        id: '64a000000000000000000003',
        contractId: CONTRACT,
        status: 'PENDING_SIGNATURES'
      } as any)
      contractRepo.findById.mockResolvedValue(makeContract({ contractType: 'FULL_BUYOUT' }))
      await expect(
        service.signMangaka(CONTRACT, '64a000000000000000000003', MANGAKA, 'm@x.com', '123456')
      ).rejects.toThrow(/MangakaSignNotRequired/)
    })

    it('mangaka sign rejected when not the contract mangaka', async () => {
      amendmentRepo.findById.mockResolvedValue({
        id: '64a000000000000000000003',
        contractId: CONTRACT,
        status: 'PENDING_SIGNATURES'
      } as any)
      contractRepo.findById.mockResolvedValue(makeContract())
      await expect(
        service.signMangaka(CONTRACT, '64a000000000000000000003', 'intruder000000000000', 'i@x.com', '123456')
      ).rejects.toMatchObject({
        status: 403,
        response: { message: [{ message: 'Error.NotContractMangaka', path: 'mangakaId' }] }
      })
    })

    it('REVENUE_SHARE: mangaka sign alone does NOT execute (board pending)', async () => {
      amendmentRepo.findById.mockResolvedValue({
        id: '64a000000000000000000003',
        contractId: CONTRACT,
        status: 'PENDING_SIGNATURES',
        mangakaSignedAt: null
      } as any)
      contractRepo.findById.mockResolvedValue(makeContract())
      contractRepo.findWithBoardDecision.mockResolvedValue(boardCtx())
      amendmentRepo.countBoardSignatures.mockResolvedValue(0)
      await service.signMangaka(CONTRACT, '64a000000000000000000003', MANGAKA, 'm@x.com', '123456')
      expect(amendmentRepo.executeAndApply).not.toHaveBeenCalled()
      expect(amendmentRepo.update).toHaveBeenCalledWith(
        '64a000000000000000000003',
        expect.objectContaining({ mangakaSignedAt: expect.any(Date) })
      )
    })

    it('FULL_BUYOUT: last board sign executes (no mangaka needed)', async () => {
      amendmentRepo.findById.mockResolvedValue({
        id: '64a000000000000000000003',
        contractId: CONTRACT,
        status: 'PENDING_SIGNATURES'
      } as any)
      contractRepo.findById.mockResolvedValue(makeContract({ contractType: 'FULL_BUYOUT' }))
      contractRepo.findWithBoardDecision.mockResolvedValue({
        id: CONTRACT,
        mangakaId: MANGAKA,
        contractType: 'FULL_BUYOUT',
        boardDecision: { boardSession: { allowedEditorIds: ['b1'] } }
      } as any)
      amendmentRepo.findSignature.mockResolvedValue(null)
      amendmentRepo.countBoardSignatures.mockResolvedValue(1)
      amendmentRepo.executeAndApply.mockResolvedValue({ applied: true })
      await service.signBoard(CONTRACT, '64a000000000000000000003', 'b1', 'b1@x.com', '123456')
      expect(amendmentRepo.executeAndApply).toHaveBeenCalledWith('64a000000000000000000003', CONTRACT, 'b1')
    })

    it('board sign rejected when signer not in allowedEditorIds', async () => {
      amendmentRepo.findById.mockResolvedValue({
        id: '64a000000000000000000003',
        contractId: CONTRACT,
        status: 'PENDING_SIGNATURES'
      } as any)
      contractRepo.findById.mockResolvedValue(makeContract())
      contractRepo.findWithBoardDecision.mockResolvedValue(boardCtx())
      await expect(
        service.signBoard(CONTRACT, '64a000000000000000000003', 'outsider', 'o@x.com', '123456')
      ).rejects.toThrow(/Error.NotAuthorizedInBoard/)
    })
  })

  describe('reject + void', () => {
    it('mangaka reject (REVENUE_SHARE) → DRAFT + clears signatures', async () => {
      amendmentRepo.findById.mockResolvedValue({
        id: '64a000000000000000000020',
        contractId: CONTRACT,
        status: 'PENDING_SIGNATURES'
      } as any)
      contractRepo.findById.mockResolvedValue(makeContract())
      amendmentRepo.update.mockResolvedValue({ id: '64a000000000000000000020', status: 'DRAFT' } as any)
      await service.reject(CONTRACT, '64a000000000000000000020', MANGAKA, 'nope')
      expect(amendmentRepo.update).toHaveBeenCalledWith(
        '64a000000000000000000020',
        expect.objectContaining({ status: 'DRAFT', reason: 'nope' })
      )
      expect(amendmentRepo.clearSignatures).toHaveBeenCalledWith('64a000000000000000000020')
    })

    it('reject rejected for FULL_BUYOUT', async () => {
      amendmentRepo.findById.mockResolvedValue({
        id: '64a000000000000000000020',
        contractId: CONTRACT,
        status: 'PENDING_SIGNATURES'
      } as any)
      contractRepo.findById.mockResolvedValue(makeContract({ contractType: 'FULL_BUYOUT' }))
      await expect(service.reject(CONTRACT, '64a000000000000000000020', MANGAKA, 'x')).rejects.toThrow(
        /MangakaSignNotRequired/
      )
    })

    it('void terminal amendment → 409', async () => {
      amendmentRepo.findById.mockResolvedValue({
        id: '64a000000000000000000020',
        contractId: CONTRACT,
        status: 'FULLY_EXECUTED'
      } as any)
      contractRepo.findById.mockResolvedValue(makeContract())
      await expect(service.void(CONTRACT, '64a000000000000000000020', EDITOR, 'stop')).rejects.toMatchObject({
        status: 409,
        response: {
          message: expect.arrayContaining([
            expect.objectContaining({ message: expect.stringContaining('AmendmentNotVoidable') })
          ])
        }
      })
    })

    it('void DRAFT → VOIDED', async () => {
      amendmentRepo.findById.mockResolvedValue({
        id: '64a000000000000000000020',
        contractId: CONTRACT,
        status: 'DRAFT'
      } as any)
      contractRepo.findById.mockResolvedValue(makeContract())
      amendmentRepo.update.mockResolvedValue({ id: '64a000000000000000000020', status: 'VOIDED' } as any)
      await service.void(CONTRACT, '64a000000000000000000020', EDITOR, 'stop')
      expect(amendmentRepo.update).toHaveBeenCalledWith(
        '64a000000000000000000020',
        expect.objectContaining({ status: 'VOIDED', voidReason: 'stop' })
      )
    })
  })
})
