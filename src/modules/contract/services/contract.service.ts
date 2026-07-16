import { Injectable } from '@nestjs/common'
import { AuditEntityType, ContractStatus, NotificationType } from '@prisma/client'
import { ContractRepo } from '../contract.repo'
import { ContractErrors } from '../errors/contract.errors'
import { CreateContractBodyDto, EditorUpdateContractBodyDto, ReportRevenueBodyDto } from '../dto/contract.dto'
import { AuthOtpService } from 'src/modules/auth/services/auth-otp.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { RoleName } from 'src/core/security/constants/role.constant'
import { DomainEvent } from 'src/core/events/domain-events'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { canTransitionContract, CONTRACT_EDITABLE_STATUSES, CONTRACT_SIGNABLE_STATUSES } from '../contract.constant'
import { AuditService } from 'src/modules/audit/audit.service'
import { ContractMessages } from '../contract.messages'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class ContractService {
  constructor(
    private readonly contractRepo: ContractRepo,
    private readonly authOtpService: AuthOtpService,
    private readonly notificationService: NotificationService,
    private readonly domainEventBus: DomainEventBus,
    private readonly auditService: AuditService
  ) {}

  // Hàm kiểm tra trạng thái hoạt động của module
  healthCheck() {
    return { status: 'OK', module: 'Contract' }
  }

  async getContracts(userId: string, roleName: string) {
    return this.contractRepo.findManyByViewer(userId, roleName)
  }

  async getContractById(contractId: string, userId: string, roleName: string) {
    if (!OBJECT_ID_RE.test(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (!this.canViewContract(contract, userId, roleName)) throw ContractErrors.ContractAccessDenied()

    return contract
  }

  async getContractVersions(contractId: string, userId: string, roleName: string) {
    if (!OBJECT_ID_RE.test(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (!this.canViewContract(contract, userId, roleName)) throw ContractErrors.ContractAccessDenied()

    return this.contractRepo.findVersionsByContractId(contractId)
  }

  async getContractVersionById(contractId: string, versionId: string, userId: string, roleName: string) {
    if (!OBJECT_ID_RE.test(contractId) || !OBJECT_ID_RE.test(versionId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (!this.canViewContract(contract, userId, roleName)) throw ContractErrors.ContractAccessDenied()

    const version = await this.contractRepo.findVersionById(contractId, versionId)
    if (!version) throw ContractErrors.NotFound()

    return version
  }

  // B-CON-02: guard chuyển trạng thái hợp lệ theo CONTRACT_TRANSITIONS.
  private assertTransition(from: ContractStatus, to: ContractStatus) {
    if (!canTransitionContract(from, to)) throw ContractErrors.InvalidContractTransition()
  }

  // Audit best-effort: gọi SAU khi DB write commit, NGOÀI transaction. AuditService.record
  // đã tự nuốt lỗi trong try/catch (audit.service.ts) nhưng vẫn bọc thêm ở đây để an toàn
  // nếu ngày mai ai đó thay đổi AuditService. KHÔNG BAO GIỜ throw ra ngoài (AGENTS §8).
  private async auditTransition(
    contractId: string,
    from: ContractStatus,
    to: ContractStatus,
    actorId: string | null,
    reason?: string
  ) {
    try {
      await this.auditService.record({
        actorId,
        entityType: AuditEntityType.CONTRACT,
        entityId: contractId,
        action: 'TRANSITION',
        fromState: from,
        toState: to,
        reason
      })
    } catch {
      // intentionally swallowed — audit is best-effort
    }
  }

  private canViewContract(contract: { editorId: string | null; mangakaId: string }, userId: string, roleName: string) {
    if (roleName === RoleName.BOARD_MEMBER) return true
    if (roleName === RoleName.EDITOR) return contract.editorId === userId
    if (roleName === RoleName.MANGAKA) return contract.mangakaId === userId

    return false
  }

  // Khởi tạo bản hợp đồng nháp (Editor tạo). B-CON-01: chỉ tạo được sau khi series đã SERIALIZED.
  async createDraft(editorId: string, dto: CreateContractBodyDto) {
    if (!OBJECT_ID_RE.test(dto.seriesId)) throw ContractErrors.NotFound()
    const seriesStatus = await this.contractRepo.findSeriesStatus(dto.seriesId)
    if (seriesStatus !== 'SERIALIZED') throw ContractErrors.SeriesNotSerialized()
    const contract = await this.contractRepo.createDraft(editorId, dto)

    await Promise.all([
      this.notificationService.notifySafe({
        recipientId: editorId,
        type: NotificationType.CONTRACT,
        referenceId: contract.id,
        referenceType: 'CONTRACT_DRAFT_CREATED',
        content: ContractMessages.notification.contractDraftCreatedEditor
      }),
      this.notificationService.notifySafe({
        recipientId: dto.mangakaId,
        type: NotificationType.CONTRACT,
        referenceId: contract.id,
        referenceType: 'CONTRACT_DRAFT_CREATED',
        content: ContractMessages.notification.contractDraftCreatedMangaka
      })
    ])

    return contract
  }

  // Gửi hợp đồng sang cho Mangaka xem xét và thương lượng
  async sendToMangaka(contractId: string, editorId: string) {
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.editorId !== editorId) throw ContractErrors.UnauthorizedEditor()
    this.assertTransition(contract.status, ContractStatus.MANGAKA_REVIEW)

    const updated = await this.contractRepo.updateStatus(contractId, ContractStatus.MANGAKA_REVIEW)

    await this.notificationService.notifySafe({
      recipientId: contract.mangakaId,
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'CONTRACT_SENT_TO_MANGAKA',
      content: ContractMessages.notification.contractSentToMangaka
    })

    await this.auditTransition(updated.id, contract.status, ContractStatus.MANGAKA_REVIEW, editorId)

    return updated
  }

  // Editor cập nhật lại điều khoản thương lượng và tự động tăng số hiệu phiên bản (versionNumber)
  async editorUpdateContract(contractId: string, editorId: string, dto: EditorUpdateContractBodyDto, note?: string) {
    if (!OBJECT_ID_RE.test(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.editorId !== editorId) throw ContractErrors.UnauthorizedEditor()
    // B-CON-02: chỉ sửa được khi còn thương lượng (chưa ký/terminal).
    if (!CONTRACT_EDITABLE_STATUSES.includes(contract.status)) throw ContractErrors.InvalidContractTransition()

    const nextVersionNumber = contract.versions.length + 1

    const updateData = {
      ...dto,
      status: ContractStatus.NEGOTIATION,
      mangakaSignedAt: null,
      boardSignedAt: null
    }

    const updated = await this.contractRepo.updateAndLogVersion(
      contractId,
      updateData,
      editorId,
      nextVersionNumber,
      note
    )

    await this.notificationService.notifySafe({
      recipientId: contract.mangakaId,
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'CONTRACT_UPDATED',
      content: ContractMessages.notification.contractUpdated
    })

    return updated
  }

  // Mangaka đồng ý với các điều khoản hiện tại, sẵn sàng chuyển qua bước ký kết.
  // B-CON-02: chỉ Mangaka của HĐ được approve (chặn approve hộ HĐ người khác).
  async mangakaApprove(contractId: string, userId: string) {
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.mangakaId !== userId) throw ContractErrors.NotContractMangaka()
    this.assertTransition(contract.status, ContractStatus.MANGAKA_APPROVED)

    const updated = await this.contractRepo.updateStatus(contractId, ContractStatus.MANGAKA_APPROVED)

    await this.auditTransition(contractId, contract.status, ContractStatus.MANGAKA_APPROVED, userId)

    await this.notificationService.notifySafe({
      recipientId: contract.editorId ?? '',
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'CONTRACT_MANGAKA_APPROVED',
      content: ContractMessages.notification.contractMangakaApproved
    })

    return updated
  }

  // B-CON-02: Mangaka yêu cầu chỉnh sửa điều khoản (MANGAKA_REVIEW → NEGOTIATION).
  async mangakaRequestChanges(contractId: string, userId: string) {
    if (!OBJECT_ID_RE.test(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.mangakaId !== userId) throw ContractErrors.NotContractMangaka()
    this.assertTransition(contract.status, ContractStatus.NEGOTIATION)

    const updated = await this.contractRepo.updateStatus(contractId, ContractStatus.NEGOTIATION)
    await this.auditTransition(contractId, contract.status, ContractStatus.NEGOTIATION, userId)
    await this.notificationService.notifySafe({
      recipientId: contract.editorId ?? '',
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'CONTRACT_MANGAKA_REQUESTED_CHANGES',
      content: ContractMessages.notification.mangakaRequestedChanges
    })
    return updated
  }

  // B-CON-02 (BOARD_REVIEW): Board duyệt điều khoản sau khi Mangaka gật (MANGAKA_APPROVED → BOARD_APPROVED).
  async boardApprove(contractId: string) {
    if (!OBJECT_ID_RE.test(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    this.assertTransition(contract.status, ContractStatus.BOARD_APPROVED)

    const updated = await this.contractRepo.updateStatus(contractId, ContractStatus.BOARD_APPROVED)
    await this.auditTransition(contractId, contract.status, ContractStatus.BOARD_APPROVED, null)
    await Promise.all([
      this.notificationService.notifySafe({
        recipientId: contract.mangakaId,
        type: NotificationType.CONTRACT,
        referenceId: updated.id,
        referenceType: 'CONTRACT_BOARD_APPROVED',
        content: ContractMessages.notification.boardApproved
      }),
      this.notificationService.notifySafe({
        recipientId: contract.editorId ?? '',
        type: NotificationType.CONTRACT,
        referenceId: updated.id,
        referenceType: 'CONTRACT_BOARD_APPROVED',
        content: ContractMessages.notification.boardApproved
      })
    ])
    return updated
  }

  // B-CON-02 (BOARD_REVIEW): Board yêu cầu chỉnh sửa (MANGAKA_APPROVED → NEGOTIATION, phải gửi lại Mangaka).
  async boardRequestChanges(contractId: string) {
    if (!OBJECT_ID_RE.test(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    this.assertTransition(contract.status, ContractStatus.NEGOTIATION)

    const updated = await this.contractRepo.updateStatus(contractId, ContractStatus.NEGOTIATION, {
      mangakaSignedAt: null,
      boardSignedAt: null
    })
    await this.auditTransition(contractId, contract.status, ContractStatus.NEGOTIATION, null)
    await this.notificationService.notifySafe({
      recipientId: contract.editorId ?? '',
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'CONTRACT_BOARD_REQUESTED_CHANGES',
      content: ContractMessages.notification.boardRequestedChanges
    })
    return updated
  }

  // Tiến trình ký kết từ phía Mangaka
  async signByMangakaWithOtp(contractId: string, loggedInUserId: string, loggedInUserEmail: string, otpCode: string) {
    if (!OBJECT_ID_RE.test(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.mangakaSignedAt) throw ContractErrors.AlreadySigned()
    // B-CON-02: chưa BOARD_APPROVED thì chưa được ký.
    if (!CONTRACT_SIGNABLE_STATUSES.includes(contract.status)) throw ContractErrors.NotSignableYet()

    // LỚP 1: Kiểm tra xem tài khoản đang đăng nhập có đúng là Mangaka được chỉ định trong hợp đồng này không
    if (contract.mangakaId !== loggedInUserId) {
      throw ContractErrors.NotContractMangaka()
    }

    // LỚP 2: Gọi AuthOtpService đối chiếu mã OTP dựa trên Email của người dùng đang đăng nhập
    await this.authOtpService.validateOtpCode({
      email: loggedInUserEmail,
      code: otpCode,
      purpose: 'SIGNING_CONTRACT' // Đồng bộ chung một loại purpose với phía Board
    })

    // LỚP 3: Mọi thứ hợp lệ -> Tiến hành ký kết
    const updatedData = { mangakaSignedAt: new Date() }
    let nextStatus: ContractStatus = ContractStatus.MANGAKA_SIGNED

    if (contract.boardSignedAt) {
      nextStatus = ContractStatus.FULLY_EXECUTED
    }

    const result = await this.contractRepo.updateStatus(contractId, nextStatus, updatedData)

    await this.auditTransition(contractId, contract.status, nextStatus, loggedInUserId)

    if (nextStatus === ContractStatus.FULLY_EXECUTED) {
      this.domainEventBus.emit(DomainEvent.ContractExecuted, { contractId: result.id, seriesId: result.seriesId })
    }
    return result
  }

  // Tiến trình ký kết đồng thuận từ phía Ban Giám Đốc (Board) - Quan hệ 1-N tối ưu
  async signByBoardWithOtp(contractId: string, loggedInUserId: string, loggedInUserEmail: string, otpCode: string) {
    if (!OBJECT_ID_RE.test(contractId)) throw ContractErrors.NotFound()
    // 1. Gọi Repo lấy hợp đồng và thông tin Quyết định (đã lược bỏ khuyết allowedEditors)
    const contract = await this.contractRepo.findWithBoardDecision(contractId)

    if (!contract) throw ContractErrors.NotFound()
    if (contract.boardSignedAt) throw ContractErrors.AlreadySigned()
    if (!contract.boardDecision) throw ContractErrors.BoardDecisionNotFound()
    // B-CON-02: chưa BOARD_APPROVED thì chưa được ký.
    if (!CONTRACT_SIGNABLE_STATUSES.includes(contract.status)) throw ContractErrors.NotSignableYet()

    // 2. [BẢO MẬT] Kiểm tra ID sếp bằng hàm .includes() trực tiếp trên mảng chuỗi ID nguyên thủy của MongoDB
    const isAllowed = contract.boardDecision.boardSession.allowedEditorIds.includes(loggedInUserId)
    if (!isAllowed) throw ContractErrors.NotAuthorizedInBoard()

    // 3. Gọi Repo kiểm tra sếp này đã ký vào bản hợp đồng này trước đó chưa
    const alreadySigned = await this.contractRepo.findSpecificSignature(contractId, loggedInUserId)
    if (alreadySigned) throw ContractErrors.BoardMemberAlreadySigned()

    // 4. [XÁC THỰC OTP] Đối chiếu mã OTP
    await this.authOtpService.validateOtpCode({
      email: loggedInUserEmail,
      code: otpCode,
      purpose: 'SIGNING_CONTRACT'
    })

    // 5. [TÍNH TOÁN ĐỒNG THUẬN]
    // Lấy tổng số lượng sếp bắt buộc phải ký từ độ dài mảng ID
    const totalRequiredSigns = contract.boardDecision?.boardSession?.allowedEditorIds?.length || 0

    // Gọi Repo đếm số chữ ký thực tế hiện tại có trong DB
    const currentActualSigns = await this.contractRepo.countBoardSignatures(contractId)
    const newTotalSigns = currentActualSigns + 1

    const shouldFinalizeBoard = newTotalSigns === totalRequiredSigns
    let result

    if (shouldFinalizeBoard) {
      const updatedData = { boardSignedAt: new Date() }
      let nextStatus: ContractStatus = ContractStatus.BOARD_APPROVED

      if (contract.mangakaSignedAt) {
        nextStatus = ContractStatus.FULLY_EXECUTED
      }

      // Gọi Repo thực thi lưu chữ ký cuối cùng và cập nhật trạng thái hợp đồng chính
      result = await this.contractRepo.executeBoardSignature(contractId, loggedInUserId, true, nextStatus, updatedData)

      await this.auditTransition(contractId, contract.status, nextStatus, loggedInUserId)

      if (nextStatus === ContractStatus.FULLY_EXECUTED && result) {
        this.domainEventBus.emit(DomainEvent.ContractExecuted, { contractId: result.id, seriesId: result.seriesId })
      }

      if (result) {
        await Promise.all([
          this.notificationService.notifySafe({
            recipientId: contract.mangakaId,
            type: NotificationType.CONTRACT,
            referenceId: result.id,
            referenceType: 'CONTRACT_FULLY_EXECUTED',
            content: ContractMessages.notification.contractFullyExecutedMangaka
          }),
          this.notificationService.notifySafe({
            recipientId: contract.editorId ?? '',
            type: NotificationType.CONTRACT,
            referenceId: result.id,
            referenceType: 'CONTRACT_FULLY_EXECUTED',
            content: ContractMessages.notification.contractFullyExecutedEditor
          })
        ])
      }

      return {
        status: 'COMPLETED',
        message: 'Toàn bộ thành viên Hội đồng Ban giám đốc đã ký kết thành công!',
        contract: result
      }
    } else {
      // Gọi Repo lưu vết chữ ký riêng lẻ (chưa chốt hợp đồng)
      result = await this.contractRepo.executeBoardSignature(contractId, loggedInUserId, false)

      return {
        status: 'PENDING_MORE_SIGNATURES',
        message: `Ghi nhận chữ ký thành công. Đang chờ các thành viên khác trong Hội đồng ký kết (${newTotalSigns}/${totalRequiredSigns})`,
        contract: result
      }
    }
  }

  async checkContractStatus(contractId: string, currentUserId: string, currentUserRole: string) {
    if (!OBJECT_ID_RE.test(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.getContractSignaturesProgress(contractId)
    if (!contract) {
      throw ContractErrors.NotFound()
    }

    // Chặn Mangaka xem trộm hợp đồng của người khác
    if (currentUserRole === 'MANGAKA' && contract.mangakaId !== currentUserId) {
      throw ContractErrors.NotContractMangaka()
    }

    // Kiểm tra quyết định hội đồng đi kèm
    if (!contract.boardDecision || !contract.boardDecision.boardSession) {
      throw ContractErrors.BoardDecisionNotFound()
    }

    const allowedEditorIds = contract.boardDecision.boardSession.allowedEditorIds || []

    // Chặn BOARD_EDITOR xem trộm tiến độ nếu không thuộc hội đồng được chỉ định
    if (currentUserRole === 'BOARD_EDITOR' && !allowedEditorIds.includes(currentUserId)) {
      throw ContractErrors.NotAuthorizedInBoard()
    }

    // Khớp chính xác với tên trường mảng từ repo trả ra
    const signedSignatures = contract.contractSignatures || []

    const boardSignatures = {
      signedEditors: [] as Array<{ id: string; actionAt: Date }>,
      pendingEditors: [] as Array<{ id: string; actionAt: null }>
    }

    // Phân loại tiến độ ký duyệt của các sếp
    allowedEditorIds.forEach((managerId) => {
      const signatureLog = signedSignatures.find((sig) => sig.userId === managerId)

      if (signatureLog) {
        boardSignatures.signedEditors.push({
          id: managerId,
          actionAt: signatureLog.signedAt
        })
      } else {
        boardSignatures.pendingEditors.push({
          id: managerId,
          actionAt: null
        })
      }
    })

    return {
      id: contract.id,
      status: contract.status,
      mangaka: {
        id: contract.mangakaId,
        isSigned: !!contract.mangakaSignedAt,
        signedAt: contract.mangakaSignedAt
      },
      boardProgress: {
        totalRequired: allowedEditorIds.length,
        totalSigned: boardSignatures.signedEditors.length,
        signedEditors: boardSignatures.signedEditors,
        pendingEditors: boardSignatures.pendingEditors
      }
    }
  }

  // B-CON-07 (Flow 6): Board/Editor nhập doanh thu kỳ cho HĐ REVENUE_SHARE FULLY_EXECUTED → emit RevenueReported → engine chia theo ownership.
  async reportRevenue(contractId: string, userId: string, roleName: string, body: ReportRevenueBodyDto) {
    if (!OBJECT_ID_RE.test(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.contractType !== 'REVENUE_SHARE' || contract.status !== 'FULLY_EXECUTED') {
      throw ContractErrors.RevenueNotApplicable()
    }
    if (roleName === RoleName.EDITOR && contract.editorId !== userId) {
      throw ContractErrors.UnauthorizedEditor()
    }
    this.domainEventBus.emit(DomainEvent.RevenueReported, {
      contractId,
      revenue: body.revenue,
      period: body.period
    })
    await this.auditService.record({
      actorId: userId,
      entityType: AuditEntityType.CONTRACT,
      entityId: contractId,
      action: 'REVENUE_REPORTED',
      reason: `revenue=${body.revenue} period=${body.period}`
    })
    return { message: 'Đã ghi nhận doanh thu, hệ thống đang chia theo hợp đồng.' }
  }
}
