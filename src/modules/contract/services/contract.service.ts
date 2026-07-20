import { Injectable } from '@nestjs/common'
import { AssetType, AuditEntityType, ContractAmendmentStatus, ContractStatus, NotificationType } from '@prisma/client'
import { ContractRepo } from '../contract.repo'
import { ContractErrors } from '../errors/contract.errors'
import { CreateContractBodyDto, EditorUpdateContractBodyDto, ReportRevenueBodyDto } from '../dto/contract.dto'
import { AuthOtpService } from 'src/modules/auth/services/auth-otp.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { RoleName } from 'src/core/security/constants/role.constant'
import { DomainEvent } from 'src/core/events/domain-events'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import {
  canTransitionContract,
  CONTRACT_CREATION_BLOCKING_STATUSES,
  CONTRACT_EDITABLE_STATUSES,
  PDF_EXPORTABLE_STATUSES,
  CONTRACT_SIGNABLE_STATUSES
} from '../contract.constant'
import { AuditService } from 'src/modules/audit/audit.service'
import { ContractMessages } from '../contract.messages'
import { PdfRenderService, type ContractPdfData } from 'src/infrastructure/pdf/pdf-render.service'
import { StorageService as ObjectStorageService } from 'src/infrastructure/storage/storage.service'
import { StorageRepository } from 'src/modules/storage/storage.repo'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class ContractService {
  constructor(
    private readonly contractRepo: ContractRepo,
    private readonly authOtpService: AuthOtpService,
    private readonly notificationService: NotificationService,
    private readonly domainEventBus: DomainEventBus,
    private readonly auditService: AuditService,
    private readonly pdfRenderService: PdfRenderService,
    private readonly objectStorageService: ObjectStorageService,
    private readonly storageRepository: StorageRepository
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

  async exportPdf(contractId: string, userId: string, roleName: string) {
    if (!OBJECT_ID_RE.test(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findByIdForPdf(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (!this.canViewContract(contract, userId, roleName)) throw ContractErrors.ContractAccessDenied()
    if (!PDF_EXPORTABLE_STATUSES.includes(contract.status)) throw ContractErrors.ContractNotExecutedForPdf()

    const executedAmendments = contract.amendments.filter(
      (amendment) => amendment.status === ContractAmendmentStatus.FULLY_EXECUTED
    )
    const key = `contracts/${contract.id}/contract-v${contract.versions.length}-a${executedAmendments.length}.pdf`
    const exists = await this.objectStorageService.headObjectExists(key)

    if (!exists) {
      const data = this.toContractPdfData(contract, executedAmendments)
      const pdf = await this.pdfRenderService.renderContractPdf(data)
      await this.objectStorageService.putObject(key, pdf, 'application/pdf')
      await this.storageRepository.createAsset({
        uploadedBy: userId,
        name: `contract-${contract.id}-v${contract.versions.length}.pdf`,
        filePath: key,
        assetType: AssetType.DOCUMENT
      })
    }

    return { ...(await this.objectStorageService.createPresignedDownload(key)), key }
  }

  private toContractPdfData(
    contract: Awaited<ReturnType<ContractRepo['findByIdForPdf']>> & {},
    executedAmendments: Array<{ fullyExecutedAt: Date | null }>
  ): ContractPdfData {
    const toIso = (value: Date | null) => value?.toISOString() ?? null
    return {
      id: contract.id,
      createdAt: contract.createdAt.toISOString(),
      contractType: contract.contractType,
      valuationAmount: contract.valuationAmount,
      publisherOwnershipPct: contract.publisherOwnershipPct,
      mangakaOwnershipPct: contract.mangakaOwnershipPct,
      terminationClause: contract.terminationClause,
      contractStart: toIso(contract.contractStart),
      contractEnd: toIso(contract.contractEnd),
      status: contract.status,
      mangakaSignedAt: toIso(contract.mangakaSignedAt),
      boardSignedAt: toIso(contract.boardSignedAt),
      series: contract.series,
      mangaka: { displayName: contract.mangaka.displayName },
      editor: contract.editor ? { displayName: contract.editor.displayName } : null,
      boardDecision: contract.boardDecision
        ? {
            decisionType: contract.boardDecision.decisionType,
            result: contract.boardDecision.result,
            decidedAt: toIso(contract.boardDecision.decidedAt),
            boardSession: {
              title: contract.boardDecision.boardSession.title,
              startTime: contract.boardDecision.boardSession.startTime.toISOString()
            }
          }
        : null,
      conditions: contract.conditions.map((condition) => ({
        conditionType: condition.conditionType,
        thresholdConfig: condition.thresholdConfig,
        payoutAmount: condition.payoutAmount,
        payoutPct: condition.payoutPct,
        status: condition.status
      })),
      signatures: contract.contractSignatures
        .filter((signature) => signature.role === 'BOARD_EDITOR')
        .map((signature) => ({
          displayName: signature.user?.displayName ?? signature.userId,
          signedAt: signature.signedAt.toISOString()
        })),
      versionCount: contract.versions.length,
      executedAmendmentCount: executedAmendments.length,
      latestAmendmentAt:
        executedAmendments
          .reduce<Date | null>(
            (latest, amendment) =>
              !amendment.fullyExecutedAt || (latest && latest >= amendment.fullyExecutedAt)
                ? latest
                : amendment.fullyExecutedAt,
            null
          )
          ?.toISOString() ?? null
    }
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
    if (!OBJECT_ID_RE.test(dto.seriesId) || !OBJECT_ID_RE.test(dto.boardDecisionId)) throw ContractErrors.NotFound()

    const [series, decision] = await Promise.all([
      this.contractRepo.findSeriesForContractCreation(dto.seriesId),
      this.contractRepo.findBoardDecisionForContractCreation(dto.boardDecisionId)
    ])
    if (!series) throw ContractErrors.NotFound()
    if (!decision) throw ContractErrors.ContractCreationBoardDecisionNotFound()
    if (series.status !== 'SERIALIZED') throw ContractErrors.SeriesNotSerialized()
    if (series.mangakaId !== dto.mangakaId) throw ContractErrors.ContractMangakaMismatch()
    if (
      decision.targetSeriesId !== dto.seriesId ||
      decision.decisionType !== 'SERIALIZATION' ||
      decision.result !== 'APPROVED'
    ) {
      throw ContractErrors.InvalidSerializationDecision()
    }

    const existing = await this.contractRepo.findBlockingContractForCreation(
      dto.seriesId,
      dto.boardDecisionId,
      CONTRACT_CREATION_BLOCKING_STATUSES
    )
    if (existing) throw ContractErrors.OpenContractExists()

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
  // F-07 (audit 2026-07-20): dispatch workflow-status ở tầng service (controller chỉ chuyển tiếp).
  updateStatusByWorkflow(contractId: string, userId: string, status: ContractStatus) {
    if (status === ContractStatus.MANGAKA_REVIEW) return this.sendToMangaka(contractId, userId)
    if (status === ContractStatus.MANGAKA_APPROVED) return this.mangakaApprove(contractId, userId)
    throw ContractErrors.InvalidStatus()
  }

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

    const updateData = {
      ...dto,
      status: ContractStatus.NEGOTIATION,
      mangakaSignedAt: null,
      boardSignedAt: null
    }

    // S-05: versionNumber nay do repo cấp BÊN TRONG transaction (kèm retry P2002),
    // không tính từ snapshot đọc ngoài nữa.
    const updated = await this.contractRepo.updateAndLogVersion(contractId, updateData, editorId, note)

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
  async mangakaRequestChanges(contractId: string, userId: string, reason: string) {
    if (!OBJECT_ID_RE.test(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.mangakaId !== userId) throw ContractErrors.NotContractMangaka()
    this.assertTransition(contract.status, ContractStatus.NEGOTIATION)

    const updated = await this.contractRepo.updateStatus(contractId, ContractStatus.NEGOTIATION)
    // Lý do đi vào AuditLog = bản ghi bền (tra qua GET /audit); notification chỉ là kênh báo tức thời.
    await this.auditTransition(contractId, contract.status, ContractStatus.NEGOTIATION, userId, reason)
    await this.notificationService.notifySafe({
      recipientId: contract.editorId ?? '',
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'CONTRACT_MANGAKA_REQUESTED_CHANGES',
      content: ContractMessages.notification.mangakaRequestedChanges(reason)
    })
    return updated
  }

  // B-CON-02: chỉ Board member thuộc roster phiên họp đã ra quyết định SERIALIZATION cho hợp đồng này
  // mới được xem xét điều khoản — cùng nguồn sự thật `boardSession.allowedEditorIds` mà bước KÝ dùng
  // (signByBoardWithOtp). Khác bước ký ở chỗ: xem xét = 1 đại diện là đủ, ký = cả roster.
  // Authz đứng TRƯỚC check transition để không lộ trạng thái hợp đồng cho người ngoài hội đồng.
  private async loadContractForBoardReview(contractId: string, userId: string) {
    if (!OBJECT_ID_RE.test(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findWithBoardDecision(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (!contract.boardDecision) throw ContractErrors.BoardDecisionNotFound()
    if (!contract.boardDecision.boardSession.allowedEditorIds.includes(userId))
      throw ContractErrors.NotAuthorizedInBoard()
    return contract
  }

  // B-CON-02 (BOARD_REVIEW): Board duyệt điều khoản sau khi Mangaka gật (MANGAKA_APPROVED → BOARD_APPROVED).
  async boardApprove(contractId: string, userId: string) {
    const contract = await this.loadContractForBoardReview(contractId, userId)
    this.assertTransition(contract.status, ContractStatus.BOARD_APPROVED)

    const updated = await this.contractRepo.updateStatus(contractId, ContractStatus.BOARD_APPROVED)
    await this.auditTransition(contractId, contract.status, ContractStatus.BOARD_APPROVED, userId)
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
  async boardRequestChanges(contractId: string, userId: string, reason: string) {
    const contract = await this.loadContractForBoardReview(contractId, userId)
    this.assertTransition(contract.status, ContractStatus.NEGOTIATION)

    const updated = await this.contractRepo.updateStatus(contractId, ContractStatus.NEGOTIATION, {
      mangakaSignedAt: null,
      boardSignedAt: null
    })
    await this.auditTransition(contractId, contract.status, ContractStatus.NEGOTIATION, userId, reason)
    await this.notificationService.notifySafe({
      recipientId: contract.editorId ?? '',
      type: NotificationType.CONTRACT,
      referenceId: updated.id,
      referenceType: 'CONTRACT_BOARD_REQUESTED_CHANGES',
      content: ContractMessages.notification.boardRequestedChanges(reason)
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

    // LỚP 3: Mọi thứ hợp lệ -> Tiến hành ký kết.
    // S-02: ghi mốc ký + chốt FULLY_EXECUTED trong MỘT transaction có CAS. Bản cũ
    // đọc `contract.boardSignedAt` từ snapshot rồi mới ghi ⇒ mangaka và board-cuối
    // ký đồng thời thì mỗi bên thấy bên kia "chưa ký" ⇒ không ai chốt hợp đồng.
    const settled = await this.contractRepo.recordMangakaSignatureAndSettle(contractId)
    if (!settled.signed || !settled.contract) throw ContractErrors.AlreadySigned()

    const result = settled.contract
    await this.auditTransition(contractId, contract.status, result.status, loggedInUserId)

    // Chỉ người thắng CAS mới emit → event không bao giờ bắn đôi.
    if (settled.executedNow) {
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

    // S-02: ghi chữ ký + ĐẾM LẠI BÊN TRONG transaction + CAS chốt trạng thái.
    // Bản cũ đếm ngoài transaction rồi `count + 1`: hai người ký giữa chừng đồng thời
    // cùng thấy số cũ ⇒ không ai đạt ngưỡng ⇒ hợp đồng kẹt vĩnh viễn (đã ký, không ký lại được).
    const settled = await this.contractRepo.recordBoardSignatureAndSettle(
      contractId,
      loggedInUserId,
      totalRequiredSigns
    )
    const newTotalSigns = settled.signatureCount
    const result = settled.contract

    if (settled.boardCompletedNow) {
      await this.auditTransition(contractId, contract.status, result?.status ?? contract.status, loggedInUserId)

      // Chỉ người thắng CAS mới emit → không bao giờ bắn đôi ContractExecuted.
      if (settled.executedNow && result) {
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
        message: ContractMessages.response.boardSignaturesCompleted,
        contract: result
      }
    }

    // Chữ ký đã được ghi trong transaction ở trên — nhánh này chỉ báo tiến độ.
    return {
      status: 'PENDING_MORE_SIGNATURES',
      message: ContractMessages.response.boardSignatureRecorded(newTotalSigns, totalRequiredSigns),
      contract: result
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
    return { message: ContractMessages.response.revenueRecorded }
  }
}
