import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PaymentRecordRepo } from '../payment.repo'
import { PaymentConditionRepo } from '../payment-condition.repo'
import {
  PaymentRecordNotFoundException,
  InvalidStatusForApprovalException,
  InvalidStatusForPaymentException,
  PaymentAlreadyPaidException,
  ReceiverNotFoundException,
  InvalidAmountException,
  PaymentConditionNotFoundException,
  PaymentConditionNotEditableException,
  ContractNotFoundForPaymentException,
  UnauthorizedPaymentConditionEditorException,
  PaymentAccessDeniedException
} from '../errors/payment.error'
import {
  CreatePaymentInternalDto,
  GetPaymentsQueryDto,
  PayPaymentBodyDto,
  CancelPaymentBodyDto
} from '../dto/payment.dto'
import { CreatePaymentConditionBodyType, UpdatePaymentConditionBodyType } from '../schemas/payment-condition-schema'
import { PaymentRecordStatus, PaymentConditionStatus, Prisma, AuditEntityType } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { parseThresholdConfig, assertRecurringChapterIsRecurring } from '../validation/payment-condition.validation'
import { PAYMENT_CONDITION_STATUS } from '../payment.constant'
import { AuditService } from 'src/modules/audit/audit.service'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class PaymentService {
  constructor(
    private readonly paymentRepo: PaymentRecordRepo,
    private readonly paymentConditionRepo: PaymentConditionRepo,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditService
  ) {}

  // 3. Internal service (Không lộ ra REST API công khai)
  async createPayment(dto: CreatePaymentInternalDto) {
    if (dto.amount <= 0) {
      throw new InvalidAmountException()
    }

    const receiverExists = await this.paymentRepo.findUserById(dto.receiverId)
    if (!receiverExists) {
      throw new ReceiverNotFoundException()
    }

    return this.paymentRepo.create({
      ...dto,
      status: PaymentRecordStatus.TRIGGERED
    })
  }

  async getPayments(query: GetPaymentsQueryDto) {
    const records = await this.paymentRepo.findMany(query)
    return { data: records }
  }

  // Loader nội bộ: id-guard + not-found. Dùng cho mutation Board-only (không cần object-level authz).
  private async loadPaymentOrThrow(id: string) {
    if (!OBJECT_ID_RE.test(id)) throw new PaymentRecordNotFoundException()
    const existing = await this.paymentRepo.findById(id)
    if (!existing) {
      throw new PaymentRecordNotFoundException()
    }
    return existing
  }

  // S-01: read path — object-level authorization theo phạm vi sở hữu.
  async getPaymentById(id: string, userId: string, roleName: string) {
    const existing = await this.loadPaymentOrThrow(id)
    await this.assertPaymentViewable(existing, userId, roleName)
    return existing
  }

  async approvePayment(id: string, actorId: string) {
    const existing = await this.loadPaymentOrThrow(id)
    if (existing.status !== PaymentRecordStatus.TRIGGERED) {
      throw new InvalidStatusForApprovalException()
    }

    // S-03: CAS thay cho update-theo-id. Người thua race nhận null → ném đúng lỗi
    // trạng thái và KHÔNG audit/emit (nếu không, một payment bị duyệt 2 lần).
    const payment = await this.paymentRepo.updateWithExpectedStatus(id, PaymentRecordStatus.TRIGGERED, {
      status: PaymentRecordStatus.APPROVED,
      approvedBy: actorId,
      approvedAt: new Date()
    })
    if (!payment) throw new InvalidStatusForApprovalException()

    await this.auditService.record({
      actorId,
      entityType: AuditEntityType.PAYMENT_RECORD,
      entityId: id,
      action: 'TRANSITION',
      fromState: existing.status,
      toState: PaymentRecordStatus.APPROVED
    })

    this.eventEmitter.emit('payment.approved', {
      paymentId: payment.id,
      contractId: payment.contractId,
      receiverId: payment.receiverId,
      amount: payment.amount
    })

    return payment
  }

  async payPayment(id: string, dto: PayPaymentBodyDto, actorId: string) {
    const existing = await this.loadPaymentOrThrow(id)
    if (existing.status !== PaymentRecordStatus.APPROVED) {
      throw new InvalidStatusForPaymentException()
    }

    // S-03: CAS — chặn hai request cùng PAID rồi cùng emit `payment.paid`
    // (downstream sẽ ghi nhận chi trả hai lần).
    const payment = await this.paymentRepo.updateWithExpectedStatus(id, PaymentRecordStatus.APPROVED, {
      status: PaymentRecordStatus.PAID,
      paidAt: new Date(),
      paymentMethod: dto.paymentMethod,
      transactionReference: dto.transactionReference,
      note: dto.note
    })
    if (!payment) throw new InvalidStatusForPaymentException()

    await this.auditService.record({
      actorId,
      entityType: AuditEntityType.PAYMENT_RECORD,
      entityId: id,
      action: 'TRANSITION',
      fromState: existing.status,
      toState: PaymentRecordStatus.PAID
    })

    this.eventEmitter.emit('payment.paid', {
      paymentId: payment.id,
      contractId: payment.contractId,
      receiverId: payment.receiverId,
      amount: payment.amount
    })

    return payment
  }

  async cancelPayment(id: string, dto: CancelPaymentBodyDto, actorId: string) {
    const existing = await this.loadPaymentOrThrow(id)
    if (existing.status === PaymentRecordStatus.PAID) {
      throw new PaymentAlreadyPaidException()
    }

    // S-03: CAS với điều kiện "chưa PAID". Chặn nhánh đối nghịch cancel-vs-pay
    // chạy song song rồi last-write-wins (huỷ một payment đã chi thật).
    const cancelled = await this.paymentRepo.updateWithExpectedStatus(
      id,
      { not: PaymentRecordStatus.PAID },
      {
        status: PaymentRecordStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: dto.cancelReason
      }
    )
    if (!cancelled) throw new PaymentAlreadyPaidException()

    await this.auditService.record({
      actorId,
      entityType: AuditEntityType.PAYMENT_RECORD,
      entityId: id,
      action: 'TRANSITION',
      fromState: existing.status,
      toState: PaymentRecordStatus.CANCELLED,
      reason: dto.cancelReason
    })

    return cancelled
  }

  async getPaymentsByContract(contractId: string, userId: string, roleName: string) {
    if (!OBJECT_ID_RE.test(contractId)) return { data: [] }
    await this.assertContractPaymentsViewable(contractId, userId, roleName)
    const records = await this.paymentRepo.findMany({ contractId })
    return { data: records }
  }

  async getPaymentsBySeries(seriesId: string, userId: string, roleName: string) {
    if (!OBJECT_ID_RE.test(seriesId)) return { data: [] }
    await this.assertSeriesPaymentsViewable(seriesId, userId, roleName)
    const records = await this.paymentRepo.findMany({ seriesId })
    return { data: records }
  }

  async getPaymentsByUserId(receiverId: string, userId: string, roleName: string) {
    if (!OBJECT_ID_RE.test(receiverId)) return { data: [] }
    // Board/Admin xem mọi người; ngoài ra chỉ được xem payment của CHÍNH MÌNH.
    if (!this.isPrivileged(roleName) && receiverId !== userId) {
      throw new PaymentAccessDeniedException()
    }
    const records = await this.paymentRepo.findMany({ receiverId })
    return { data: records }
  }

  // ============================================================================
  // S-01: object-level authorization helpers
  // ============================================================================

  private isPrivileged(roleName: string): boolean {
    return roleName === RoleName.BOARD_MEMBER || roleName === RoleName.SUPER_ADMIN
  }

  // Xem 1 payment: Board/Admin toàn quyền; receiver xem của mình; ngoài ra kiểm chủ contract (editor/mangaka).
  private async assertPaymentViewable(
    payment: { contractId: string; receiverId: string },
    userId: string,
    roleName: string
  ) {
    if (this.isPrivileged(roleName)) return
    if (roleName === RoleName.MANGAKA && payment.receiverId === userId) return

    const contract = await this.paymentConditionRepo.findContractById(payment.contractId)
    if (contract) {
      if (roleName === RoleName.EDITOR && contract.editorId === userId) return
      if (roleName === RoleName.MANGAKA && contract.mangakaId === userId) return
    }
    throw new PaymentAccessDeniedException()
  }

  private async assertContractPaymentsViewable(contractId: string, userId: string, roleName: string) {
    if (this.isPrivileged(roleName)) return
    const contract = await this.paymentConditionRepo.findContractById(contractId)
    if (contract) {
      if (roleName === RoleName.EDITOR && contract.editorId === userId) return
      if (roleName === RoleName.MANGAKA && contract.mangakaId === userId) return
    }
    throw new PaymentAccessDeniedException()
  }

  private async assertSeriesPaymentsViewable(seriesId: string, userId: string, roleName: string) {
    if (this.isPrivileged(roleName)) return
    const series = await this.paymentRepo.findSeriesOwners(seriesId)
    if (series) {
      if (roleName === RoleName.EDITOR && series.editorId === userId) return
      if (roleName === RoleName.MANGAKA && (series.mangakaId === userId || series.coOwnerId === userId)) return
    }
    throw new PaymentAccessDeniedException()
  }

  // ============================================================================
  // PaymentCondition CRUD (accessed via Contract routes)
  // ============================================================================

  async createPaymentCondition(contractId: string, editorId: string, dto: CreatePaymentConditionBodyType) {
    const contract = await this.assertEditorOwnsContract(contractId, editorId)

    parseThresholdConfig(dto.conditionType, dto.thresholdConfig)
    assertRecurringChapterIsRecurring(dto.conditionType, dto.isRecurring)

    return this.paymentConditionRepo.create({
      contractId: contract.id,
      conditionType: dto.conditionType,
      thresholdConfig: dto.thresholdConfig as Prisma.InputJsonValue,
      payoutAmount: dto.payoutAmount,
      payoutPct: dto.payoutPct,
      isRecurring: dto.isRecurring
    })
  }

  async getPaymentConditionsByContract(contractId: string, userId: string, roleName: string) {
    const contract = await this.assertContractViewable(contractId, userId, roleName)
    const conditions = await this.paymentConditionRepo.findManyByContractId(contract.id)
    return { data: conditions }
  }

  async updatePaymentCondition(
    contractId: string,
    conditionId: string,
    editorId: string,
    dto: UpdatePaymentConditionBodyType
  ) {
    await this.assertEditorOwnsContract(contractId, editorId)

    const condition = await this.paymentConditionRepo.findByIdAndContractId(conditionId, contractId)
    if (!condition) {
      throw new PaymentConditionNotFoundException()
    }

    this.assertConditionEditable(condition.status)

    if (dto.thresholdConfig !== undefined) {
      parseThresholdConfig(condition.conditionType, dto.thresholdConfig)
    }

    const nextIsRecurring = dto.isRecurring ?? condition.isRecurring
    assertRecurringChapterIsRecurring(condition.conditionType, nextIsRecurring)

    return this.paymentConditionRepo.update(conditionId, {
      thresholdConfig: dto.thresholdConfig as Prisma.InputJsonValue | undefined,
      payoutAmount: dto.payoutAmount,
      payoutPct: dto.payoutPct,
      isRecurring: dto.isRecurring
    })
  }

  async disablePaymentCondition(contractId: string, conditionId: string, editorId: string) {
    await this.assertEditorOwnsContract(contractId, editorId)

    const condition = await this.paymentConditionRepo.findByIdAndContractId(conditionId, contractId)
    if (!condition) {
      throw new PaymentConditionNotFoundException()
    }

    this.assertConditionEditable(condition.status)

    return this.paymentConditionRepo.update(conditionId, {
      status: PAYMENT_CONDITION_STATUS.DISABLED
    })
  }

  private async assertEditorOwnsContract(contractId: string, editorId: string) {
    const contract = await this.paymentConditionRepo.findContractById(contractId)
    if (!contract) {
      throw new ContractNotFoundForPaymentException()
    }
    if (contract.editorId !== editorId) {
      throw new UnauthorizedPaymentConditionEditorException()
    }
    return contract
  }

  private async assertContractViewable(contractId: string, userId: string, roleName: string) {
    const contract = await this.paymentConditionRepo.findContractById(contractId)
    if (!contract) {
      throw new ContractNotFoundForPaymentException()
    }

    if (roleName === RoleName.BOARD_MEMBER) {
      return contract
    }
    if (roleName === RoleName.EDITOR && contract.editorId === userId) {
      return contract
    }
    if (roleName === RoleName.MANGAKA && contract.mangakaId === userId) {
      return contract
    }

    throw new UnauthorizedPaymentConditionEditorException()
  }

  private assertConditionEditable(status: PaymentConditionStatus) {
    if (status === PaymentConditionStatus.ACHIEVED || status === PaymentConditionStatus.MISSED) {
      throw new PaymentConditionNotEditableException()
    }
  }
}
