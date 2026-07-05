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
  NotTheCoOwnerForChapterException,
  ChapterApprovalIsNotPendingException
} from '../errors/transfer.error'
import {
  CreateTransferRequestBodyDto,
  BoardDecisionTransferBodyDto,
  CreateTransferContractBodyDto,
  SignTransferContractBodyDto,
  CoOwnerRejectChapterBodyDto
} from '../dto/transfer.dto'
import { TRANSFER_REQUEST_STATUS, CO_OWNER_APPROVAL_STATUS } from '../transfer.constant'
import { TransferContractSignature, $Enums } from '@prisma/client'

@Injectable()
export class TransferService {
  constructor(
    private readonly transferRepo: TransferRepo,
    private readonly authOtpService: AuthOtpService
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

    return this.transferRepo.updateTransferRequest(id, {
      status: TRANSFER_REQUEST_STATUS.UNDER_REVIEW,
      boardDecisionId: dto.boardSessionId
    })
  }

  // B-TRF-01: Board từ chối hồ sơ năng lực ở vòng sàng lọc ban đầu
  async boardRejectScreening(id: string, dto: BoardDecisionTransferBodyDto) {
    const request = await this.getTransferRequestById(id)
    if (request.status !== TRANSFER_REQUEST_STATUS.SUBMITTED) {
      throw InvalidStatusForScreeningException
    }

    return this.transferRepo.updateTransferRequest(id, {
      status: TRANSFER_REQUEST_STATUS.REJECTED_BY_BOARD,
      boardDecisionId: dto.boardSessionId
    })
  }

  // B-TRF-02: Nhánh FULL_BUYOUT (Mô hình A) - Quyết định bàn giao tác phẩm cho Mangaka B
  async boardAssignFullBuyout(id: string, dto: BoardDecisionTransferBodyDto) {
    const request = await this.getTransferRequestById(id)

    if (request.originalContractType !== 'FULL_BUYOUT') {
      throw OnlyAppliesToFullBuyoutException
    }

    if (!request.originalContractId) {
      throw OriginalContractIdNotFoundException
    }

    await this.transferRepo.terminateOldContract(request.originalContractId)

    const newContract = await this.transferRepo.createNewContractFromTransfer({
      seriesId: request.seriesId,
      mangakaId: request.requestingMangakaId,
      sourceTransferRequestId: request.id,
      contractType: $Enums.ContractType.FULL_BUYOUT,
      conditions: [{ description: 'Mangaka B đóng góp thêm N chương mới độc lập', type: 'RECURRING', value: 10 }]
    })

    await this.transferRepo.updateSeriesOwnership(request.seriesId, {
      mangakaId: request.requestingMangakaId
    })

    await this.transferRepo.updateTransferRequest(id, {
      status: TRANSFER_REQUEST_STATUS.ACCEPTED,
      boardDecisionId: dto.boardSessionId
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

    return this.transferRepo.updateTransferRequest(id, {
      status: TRANSFER_REQUEST_STATUS.NEGOTIATING
    })
  }

  // B-TRF-03: Mangaka A đồng ý chuyển nhượng tác phẩm
  async mangakaAcceptTransfer(id: string) {
    const request = await this.getTransferRequestById(id)
    if (request.status !== TRANSFER_REQUEST_STATUS.NEGOTIATING) {
      throw RequestNotInNegotiatingStageException
    }

    return this.transferRepo.updateTransferRequest(id, {
      status: TRANSFER_REQUEST_STATUS.UNDER_REVIEW
    })
  }

  // B-TRF-03: Mangaka A từ chối chuyển nhượng tác phẩm -> Bẻ luồng về REJECTED
  async mangakaRejectTransfer(id: string) {
    const request = await this.getTransferRequestById(id)
    if (request.status !== TRANSFER_REQUEST_STATUS.NEGOTIATING) {
      throw RequestNotInNegotiatingStageException
    }

    return this.transferRepo.updateTransferRequest(id, {
      status: TRANSFER_REQUEST_STATUS.REJECTED_BY_ORIGINAL_MANGAKA
    })
  }

  // B-TRF-03: Editor lập hợp đồng thỏa thuận chuyển nhượng bản thảo 3 bên
  async createTransferContract(dto: CreateTransferContractBodyDto) {
    const request = await this.getTransferRequestById(dto.transferRequestId)

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

  // B-TRF-05: Hook kiểm duyệt - Cho phép Co-owner (Mangaka A) duyệt chương mới nộp lên
  async coOwnerApproveChapter(chapterId: string, coOwnerId: string): Promise<{ message: string }> {
    const approvalRecord = await this.transferRepo.findCoOwnerApprovalByChapterId(chapterId)
    if (!approvalRecord || approvalRecord.coOwnerId !== coOwnerId) {
      throw NotTheCoOwnerForChapterException
    }

    if (approvalRecord.status !== CO_OWNER_APPROVAL_STATUS.PENDING) {
      throw ChapterApprovalIsNotPendingException
    }

    await this.transferRepo.updateCoOwnerApproval(approvalRecord.id, {
      status: CO_OWNER_APPROVAL_STATUS.APPROVED,
      decisionAt: new Date()
    })

    return { message: TransferMessages.response.chapterApproved }
  }

  // B-TRF-05: Hook kiểm duyệt - Co-owner từ chối duyệt chương truyện kèm lý do cụ thể
  async coOwnerRejectChapter(
    chapterId: string,
    coOwnerId: string,
    dto: CoOwnerRejectChapterBodyDto
  ): Promise<{ message: string }> {
    const approvalRecord = await this.transferRepo.findCoOwnerApprovalByChapterId(chapterId)
    if (!approvalRecord || approvalRecord.coOwnerId !== coOwnerId) {
      throw NotTheCoOwnerForChapterException
    }

    if (approvalRecord.status !== CO_OWNER_APPROVAL_STATUS.PENDING) {
      throw ChapterApprovalIsNotPendingException
    }

    await this.transferRepo.updateCoOwnerApproval(approvalRecord.id, {
      status: CO_OWNER_APPROVAL_STATUS.REJECTED,
      decisionAt: new Date(),
      rejectReason: dto.rejectReason
    })

    return { message: TransferMessages.response.chapterRejected }
  }

  // B-TRF-05: Cơ chế kích hoạt tự động khi chương truyện bị quá hạn phản hồi của Co-owner
  async escalateChapterApproval(chapterId: string): Promise<{ message: string }> {
    const approvalRecord = await this.transferRepo.findCoOwnerApprovalByChapterId(chapterId)
    if (!approvalRecord || approvalRecord.status !== CO_OWNER_APPROVAL_STATUS.PENDING) {
      return { message: TransferMessages.response.noEscalationRequired }
    }

    await this.transferRepo.updateCoOwnerApproval(approvalRecord.id, {
      status: CO_OWNER_APPROVAL_STATUS.ESCALATED,
      escalatedAt: new Date()
    })

    return { message: TransferMessages.response.chapterEscalated }
  }
}
