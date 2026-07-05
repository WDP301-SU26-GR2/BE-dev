import { Injectable, NotImplementedException } from '@nestjs/common'
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
  UnauthorizedPaymentConditionEditorException
} from '../errors/payment.error'
import {
  CreatePaymentInternalDto,
  GetPaymentsQueryDto,
  ApprovePaymentBodyDto,
  PayPaymentBodyDto,
  CancelPaymentBodyDto
} from '../dto/payment.dto'
import { CreatePaymentConditionBodyType, UpdatePaymentConditionBodyType } from '../schemas/payment-condition-schema'
import { PaymentRecordStatus, PaymentConditionStatus, Prisma } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { parseThresholdConfig, assertRecurringChapterIsRecurring } from '../validation/payment-condition.validation'
import { PAYMENT_CONDITION_STATUS } from '../payment.constant'

@Injectable()
export class PaymentService {
  constructor(
    private readonly paymentRepo: PaymentRecordRepo,
    private readonly paymentConditionRepo: PaymentConditionRepo,
    private readonly eventEmitter: EventEmitter2
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

  async getPaymentById(id: string) {
    const existing = await this.paymentRepo.findById(id)
    if (!existing) {
      throw new PaymentRecordNotFoundException()
    }
    return existing
  }

  async approvePayment(id: string, dto: ApprovePaymentBodyDto) {
    const existing = await this.getPaymentById(id)
    if (existing.status !== PaymentRecordStatus.TRIGGERED) {
      throw new InvalidStatusForApprovalException()
    }

    const payment = await this.paymentRepo.update(id, {
      status: PaymentRecordStatus.APPROVED,
      approvedBy: dto.approvedBy,
      approvedAt: new Date()
    })

    this.eventEmitter.emit('payment.approved', {
      paymentId: payment.id,
      contractId: payment.contractId,
      receiverId: payment.receiverId,
      amount: payment.amount
    })

    return payment
  }

  async payPayment(id: string, dto: PayPaymentBodyDto) {
    const existing = await this.getPaymentById(id)
    if (existing.status !== PaymentRecordStatus.APPROVED) {
      throw new InvalidStatusForPaymentException()
    }

    const payment = await this.paymentRepo.update(id, {
      status: PaymentRecordStatus.PAID,
      paidAt: new Date(),
      paymentMethod: dto.paymentMethod,
      transactionReference: dto.transactionReference,
      note: dto.note
    })

    this.eventEmitter.emit('payment.paid', {
      paymentId: payment.id,
      contractId: payment.contractId,
      receiverId: payment.receiverId,
      amount: payment.amount
    })

    return payment
  }

  async cancelPayment(id: string, dto: CancelPaymentBodyDto) {
    const existing = await this.getPaymentById(id)
    if (existing.status === PaymentRecordStatus.PAID) {
      throw new PaymentAlreadyPaidException()
    }

    return this.paymentRepo.update(id, {
      status: PaymentRecordStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelReason: dto.cancelReason
    })
  }

  async getPaymentsByContract(contractId: string) {
    const records = await this.paymentRepo.findMany({ contractId })
    return { data: records }
  }

  async getPaymentsBySeries(seriesId: string) {
    const records = await this.paymentRepo.findMany({ seriesId })
    return { data: records }
  }

  async getPaymentsByUserId(receiverId: string) {
    const records = await this.paymentRepo.findMany({ receiverId })
    return { data: records }
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

  // ============================================================================
  // Placeholder methods for future payment engine (not exposed as REST)
  // ============================================================================

  createTriggeredPayment(_params: Record<string, unknown>): never {
    throw new NotImplementedException()
  }

  createRevenueSharePayment(_params: Record<string, unknown>): never {
    throw new NotImplementedException()
  }

  createCompensationPayment(_params: Record<string, unknown>): never {
    throw new NotImplementedException()
  }

  markConditionAchieved(_conditionId: string): never {
    throw new NotImplementedException()
  }

  checkConditionsAfterChapterPublished(_contractId: string, _chapterNumber: number): never {
    throw new NotImplementedException()
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
