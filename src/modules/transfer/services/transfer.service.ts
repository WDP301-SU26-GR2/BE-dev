import { Injectable } from '@nestjs/common'
import { TransferRepo } from '../transfer.repo'
import { AuthOtpService } from 'src/modules/auth/services/auth-otp.service'
import { OtpPurpose } from 'src/modules/auth/auth.constant'
import { TransferMessages } from '../errors/transfer.message'
import {
  NoActiveContractFoundException,
  TransferRequestNotFoundException,
  InvalidStatusForScreeningException,
  OnlyAppliesToFullBuyoutException,
  OriginalContractIdNotFoundException,
  OnlyAppliesToRevenueShareException,
  RequestNotInNegotiatingStageException,
  TransferContractNotFoundException,
  UserOrEmailNotFoundException,
  UserHasAlreadySignedContractException,
  TransferContractNotFoundAfterUpdateException,
  InvalidTransferStateException,
  ValuationRequiredException
} from '../errors/transfer.error'
import {
  CreateTransferRequestBodyDto,
  BoardDecisionTransferBodyDto,
  AssignFullBuyoutBodyDto,
  CreateTransferContractBodyDto,
  SignTransferContractBodyDto
} from '../dto/transfer.dto'
import { TRANSFER_REQUEST_STATUS } from '../transfer.constant'
import { TransferContractSignature, $Enums, AuditEntityType } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class TransferService {
  constructor(
    private readonly transferRepo: TransferRepo,
    private readonly authOtpService: AuthOtpService,
    private readonly auditService: AuditService
  ) {}

  // B-TRF-01: Mangaka B nộp hồ sơ yêu cầu nhận chuyển nhượng tác phẩm
  async createTransferRequest(requestingMangakaId: string, dto: CreateTransferRequestBodyDto) {
    const activeContract = await this.transferRepo.findActiveContractBySeriesId(dto.seriesId)
    if (!activeContract) {
      throw NoActiveContractFoundException
    }

    return this.transferRepo.createTransferRequest({
      seriesId: dto.seriesId,
      requestingMangakaId,
      originalMangakaId: activeContract.mangakaId,
      originalContractType: activeContract.contractType,
      proposedType: dto.proposedType,
      proposedPercentage: dto.proposedPercentage,
      planDescription: dto.planDescription,
      originalContractId: activeContract.id
    })
  }

  async getTransferRequestsByMangaka(mangakaId: string) {
    const requests = await this.transferRepo.findTransferRequestsByMangaka(mangakaId)
    return { data: requests }
  }

  async getTransferRequestById(id: string) {
    // OBJECT_ID guard: id rác → 404 sạch thay vì P2023 → 500 (AGENTS §10). Central cho mọi route dùng hàm này.
    if (!OBJECT_ID_RE.test(id)) throw TransferRequestNotFoundException
    const request = await this.transferRepo.findTransferRequestById(id)
    if (!request) {
      throw TransferRequestNotFoundException
    }
    return request
  }

  async getPendingBoardRequests() {
    const requests = await this.transferRepo.findPendingBoardRequests()
    return { data: requests }
  }

  // B-TRF-01: Board duyệt qua vòng sàng lọc hồ sơ năng lực ban đầu
  async boardApproveScreening(id: string, dto: BoardDecisionTransferBodyDto) {
    const request = await this.getTransferRequestById(id)
    if (request.status !== TRANSFER_REQUEST_STATUS.SUBMITTED) {
      throw InvalidStatusForScreeningException
    }

    const updated = await this.transferRepo.updateTransferRequest(id, {
      status: TRANSFER_REQUEST_STATUS.UNDER_REVIEW,
      boardDecisionId: dto.boardSessionId
    })
    await this.auditService.record({
      actorId: null,
      entityType: AuditEntityType.TRANSFER_REQUEST,
      entityId: id,
      action: 'TRANSITION',
      fromState: request.status,
      toState: TRANSFER_REQUEST_STATUS.UNDER_REVIEW
    })
    return updated
  }

  // B-TRF-01: Board từ chối hồ sơ năng lực ở vòng sàng lọc ban đầu
  async boardRejectScreening(id: string, dto: BoardDecisionTransferBodyDto) {
    const request = await this.getTransferRequestById(id)
    if (request.status !== TRANSFER_REQUEST_STATUS.SUBMITTED) {
      throw InvalidStatusForScreeningException
    }

    const updated = await this.transferRepo.updateTransferRequest(id, {
      status: TRANSFER_REQUEST_STATUS.REJECTED_BY_BOARD,
      boardDecisionId: dto.boardSessionId
    })
    await this.auditService.record({
      actorId: null,
      entityType: AuditEntityType.TRANSFER_REQUEST,
      entityId: id,
      action: 'TRANSITION',
      fromState: request.status,
      toState: TRANSFER_REQUEST_STATUS.REJECTED_BY_BOARD
    })
    return updated
  }

  // B-TRF-02: Nhánh FULL_BUYOUT (Mô hình A) - Board định giá lại + đặt điều kiện cho HĐ mới của B.
  async boardAssignFullBuyout(id: string, dto: AssignFullBuyoutBodyDto) {
    const request = await this.getTransferRequestById(id)

    if (request.originalContractType !== 'FULL_BUYOUT') {
      throw OnlyAppliesToFullBuyoutException
    }

    if (!request.originalContractId) {
      throw OriginalContractIdNotFoundException
    }
    if (!dto.valuationAmount || dto.valuationAmount <= 0) {
      throw ValuationRequiredException
    }

    await this.transferRepo.terminateOldContract(request.originalContractId)

    // BR-TRANSFER-05: điều kiện của B đếm theo đóng góp MỚI (Board nhập), không cộng dồn công của A.
    const newContract = await this.transferRepo.createNewContractFromTransfer({
      seriesId: request.seriesId,
      mangakaId: request.requestingMangakaId,
      sourceTransferRequestId: request.id,
      contractType: $Enums.ContractType.FULL_BUYOUT,
      valuationAmount: dto.valuationAmount,
      conditions: dto.conditions
    })

    await this.transferRepo.updateSeriesOwnership(request.seriesId, {
      mangakaId: request.requestingMangakaId
    })

    await this.transferRepo.updateTransferRequest(id, {
      status: TRANSFER_REQUEST_STATUS.ACCEPTED,
      boardDecisionId: dto.boardSessionId
    })
    await this.auditService.record({
      actorId: null,
      entityType: AuditEntityType.TRANSFER_REQUEST,
      entityId: id,
      action: 'TRANSITION',
      fromState: request.status,
      toState: TRANSFER_REQUEST_STATUS.ACCEPTED
    })

    return {
      message: TransferMessages.response.fullBuyoutProcessed,
      newContractId: (newContract as any).id
    }
  }

  // B-TRF-03: Nhánh REVENUE_SHARE - Editor bắt đầu kích hoạt luồng thương lượng với Mangaka A
  async startNegotiation(id: string) {
    const request = await this.getTransferRequestById(id)
    if (request.originalContractType !== 'REVENUE_SHARE') {
      throw OnlyAppliesToRevenueShareException
    }

    const updated = await this.transferRepo.updateTransferRequest(id, {
      status: TRANSFER_REQUEST_STATUS.NEGOTIATING
    })
    await this.auditService.record({
      actorId: null,
      entityType: AuditEntityType.TRANSFER_REQUEST,
      entityId: id,
      action: 'TRANSITION',
      fromState: request.status,
      toState: TRANSFER_REQUEST_STATUS.NEGOTIATING
    })
    return updated
  }

  // B-TRF-03: Mangaka A đồng ý chuyển nhượng tác phẩm
  async mangakaAcceptTransfer(id: string) {
    const request = await this.getTransferRequestById(id)
    if (request.status !== TRANSFER_REQUEST_STATUS.NEGOTIATING) {
      throw RequestNotInNegotiatingStageException
    }

    const updated = await this.transferRepo.updateTransferRequest(id, {
      status: TRANSFER_REQUEST_STATUS.UNDER_REVIEW
    })
    await this.auditService.record({
      actorId: null,
      entityType: AuditEntityType.TRANSFER_REQUEST,
      entityId: id,
      action: 'TRANSITION',
      fromState: request.status,
      toState: TRANSFER_REQUEST_STATUS.UNDER_REVIEW
    })
    return updated
  }

  // B-TRF-03: Mangaka A từ chối chuyển nhượng tác phẩm -> Bẻ luồng về REJECTED
  async mangakaRejectTransfer(id: string) {
    const request = await this.getTransferRequestById(id)
    if (request.status !== TRANSFER_REQUEST_STATUS.NEGOTIATING) {
      throw RequestNotInNegotiatingStageException
    }

    const updated = await this.transferRepo.updateTransferRequest(id, {
      status: TRANSFER_REQUEST_STATUS.REJECTED_BY_ORIGINAL_MANGAKA
    })
    await this.auditService.record({
      actorId: null,
      entityType: AuditEntityType.TRANSFER_REQUEST,
      entityId: id,
      action: 'TRANSITION',
      fromState: request.status,
      toState: TRANSFER_REQUEST_STATUS.REJECTED_BY_ORIGINAL_MANGAKA
    })
    return updated
  }

  // B-TRF-03: Editor lập hợp đồng thỏa thuận chuyển nhượng bản thảo 3 bên.
  // Guard: chỉ khi request đã UNDER_REVIEW (Mangaka A đã accept) — tránh lập HĐ khi chưa deal xong.
  async createTransferContract(dto: CreateTransferContractBodyDto) {
    const request = await this.getTransferRequestById(dto.transferRequestId)
    if (request.status !== TRANSFER_REQUEST_STATUS.UNDER_REVIEW) {
      throw InvalidTransferStateException
    }

    return this.transferRepo.createTransferContract({
      transferRequestId: request.id,
      seriesId: request.seriesId,
      fromMangakaId: request.originalMangakaId,
      toMangakaId: request.requestingMangakaId,
      transferType: dto.transferType,
      transferAmount: dto.transferAmount,
      newOwnershipSplit: dto.newOwnershipSplit,
      coOwnerApprovalRequired: dto.coOwnerApprovalRequired
    })
  }

  // B-TRF-03: Ký số xác thực bằng mã OTP cho các bên (Mangaka A -> Mangaka B -> Board)
  async signTransferContract(
    id: string,
    userId: string,
    role: 'MANGAKA_A' | 'MANGAKA_B' | 'BOARD',
    dto: SignTransferContractBodyDto
  ) {
    if (!OBJECT_ID_RE.test(id)) throw TransferContractNotFoundException
    const contract = await this.transferRepo.findTransferContractById(id)
    if (!contract) {
      throw TransferContractNotFoundException
    }

    const user = await this.transferRepo.findUserById(userId)
    if (!user || !user.email) {
      throw UserOrEmailNotFoundException
    }

    await this.authOtpService.validateOtpCode({
      email: user.email,
      code: dto.otpCode,
      purpose: OtpPurpose.SIGNING_CONTRACT
    })

    await this.authOtpService.burnOtp(user.email, OtpPurpose.SIGNING_CONTRACT)

    const currentSignatures: TransferContractSignature[] = contract.signatures ?? []
    const alreadySigned = currentSignatures.some(
      (sig: TransferContractSignature) => sig.userId === userId && sig.role === role
    )
    if (alreadySigned) {
      throw UserHasAlreadySignedContractException
    }

    await this.transferRepo.addTransferContractSignature(id, userId, role)

    const updatedContract = await this.transferRepo.findTransferContractById(id)
    if (!updatedContract) {
      throw TransferContractNotFoundAfterUpdateException
    }

    const freshSignatures: TransferContractSignature[] = updatedContract.signatures ?? []
    const uniqueRolesSigned = new Set<string>(freshSignatures.map((s: TransferContractSignature) => s.role))

    if (uniqueRolesSigned.has('MANGAKA_A') && uniqueRolesSigned.has('MANGAKA_B') && uniqueRolesSigned.has('BOARD')) {
      await this.transferRepo.updateTransferContractStatus(id, $Enums.TransferContractStatus.FULLY_EXECUTED)

      if (contract.transferType === 'FULL_TRANSFER') {
        await this.transferRepo.updateSeriesOwnership(contract.seriesId!, {
          mangakaId: contract.toMangakaId!,
          coOwnerId: null,
          coOwnerApprovalRequired: false
        })
      } else if (contract.transferType === 'PARTIAL_TRANSFER') {
        await this.transferRepo.updateSeriesOwnership(contract.seriesId!, {
          mangakaId: contract.toMangakaId!,
          coOwnerId: contract.fromMangakaId!,
          coOwnerApprovalRequired: true
        })
      }

      await this.transferRepo.updateTransferRequest(contract.transferRequestId!, {
        status: TRANSFER_REQUEST_STATUS.ACCEPTED
      })
    }

    return { message: TransferMessages.response.signatureRecorded }
  }

  async getSignatures(id: string) {
    if (!OBJECT_ID_RE.test(id)) throw TransferContractNotFoundException
    const contract = await this.transferRepo.findTransferContractById(id)
    if (!contract) {
      throw TransferContractNotFoundException
    }

    // Map tường minh từng thuộc tính để linter không bắt lỗi 'any'
    const formattedSignatures = (contract.signatures ?? []).map((sig) => ({
      id: sig.id,
      transferContractId: sig.transferContractId,
      userId: sig.userId,
      role: sig.role as 'MANGAKA_A' | 'MANGAKA_B' | 'BOARD',
      signedAt: sig.signedAt
    }))

    return { signatures: formattedSignatures }
  }

  // Co-owner chapter approval (B-TRF-05) đã chuyển sang chapter module (BE-A, ChapterCoOwnerService) —
  // vì transition Manuscript là single-writer ở chapter. Xem Spec 6 / A-CHP-06.
}
