import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { AuditEntityType, PaymentRecordStatus } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { AuditService } from 'src/modules/audit/audit.service'
import { CancelPaymentBodyDto, CreatePaymentInternalDto, PayPaymentBodyDto } from '../dto/payment.dto'
import {
  InvalidAmountException,
  InvalidStatusForApprovalException,
  InvalidStatusForPaymentException,
  PaymentAlreadyPaidException,
  PaymentRecordNotFoundException,
  ReceiverNotFoundException
} from '../errors/payment.error'
import { PaymentRecordRepo } from '../payment.repo'

@Injectable()
export class PaymentStateService {
  constructor(
    private readonly paymentRepo: PaymentRecordRepo,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditService
  ) {}

  async createPayment(dto: CreatePaymentInternalDto) {
    if (dto.amount <= 0) throw new InvalidAmountException()
    if (!(await this.paymentRepo.findUserById(dto.receiverId))) throw new ReceiverNotFoundException()
    return this.paymentRepo.create({ ...dto, status: PaymentRecordStatus.TRIGGERED })
  }

  async approvePayment(id: string, actorId: string) {
    const existing = await this.loadPaymentOrThrow(id)
    if (existing.status !== PaymentRecordStatus.TRIGGERED) throw new InvalidStatusForApprovalException()
    const payment = await this.paymentRepo.updateWithExpectedStatus(id, PaymentRecordStatus.TRIGGERED, {
      status: PaymentRecordStatus.APPROVED,
      approvedBy: actorId,
      approvedAt: new Date()
    })
    if (!payment) throw new InvalidStatusForApprovalException()
    await this.auditTransition(id, actorId, existing.status, PaymentRecordStatus.APPROVED)
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
    if (existing.status !== PaymentRecordStatus.APPROVED) throw new InvalidStatusForPaymentException()
    const payment = await this.paymentRepo.updateWithExpectedStatus(id, PaymentRecordStatus.APPROVED, {
      status: PaymentRecordStatus.PAID,
      paidAt: new Date(),
      paymentMethod: dto.paymentMethod,
      transactionReference: dto.transactionReference,
      note: dto.note
    })
    if (!payment) throw new InvalidStatusForPaymentException()
    await this.auditTransition(id, actorId, existing.status, PaymentRecordStatus.PAID)
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
    if (existing.status === PaymentRecordStatus.PAID) throw new PaymentAlreadyPaidException()
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
    await this.auditTransition(id, actorId, existing.status, PaymentRecordStatus.CANCELLED, dto.cancelReason)
    return cancelled
  }

  private async loadPaymentOrThrow(id: string) {
    if (!isObjectId(id)) throw new PaymentRecordNotFoundException()
    const payment = await this.paymentRepo.findById(id)
    if (!payment) throw new PaymentRecordNotFoundException()
    return payment
  }

  private auditTransition(
    id: string,
    actorId: string,
    fromState: PaymentRecordStatus,
    toState: PaymentRecordStatus,
    reason?: string
  ) {
    return this.auditService.record({
      actorId,
      entityType: AuditEntityType.PAYMENT_RECORD,
      entityId: id,
      action: 'TRANSITION',
      fromState,
      toState,
      reason
    })
  }
}
