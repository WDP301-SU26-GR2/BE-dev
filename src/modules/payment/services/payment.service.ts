import { Injectable } from '@nestjs/common'
import {
  CreatePaymentInternalDto,
  GetPaymentsQueryDto,
  PayPaymentBodyDto,
  CancelPaymentBodyDto
} from '../dto/payment.dto'
import { CreatePaymentConditionBodyType, UpdatePaymentConditionBodyType } from '../schemas/payment-condition-schema'
import { PaymentConditionService } from './payment-condition.service'
import { PaymentQueryService } from './payment-query.service'
import { PaymentStateService } from './payment-state.service'

@Injectable()
export class PaymentService {
  constructor(
    private readonly queryService: PaymentQueryService,
    private readonly stateService: PaymentStateService,
    private readonly conditionService: PaymentConditionService
  ) {}

  createPayment(dto: CreatePaymentInternalDto) {
    return this.stateService.createPayment(dto)
  }
  getPayments(query: GetPaymentsQueryDto) {
    return this.queryService.getPayments(query)
  }
  getPaymentById(id: string, userId: string, roleName: string) {
    return this.queryService.getPaymentById(id, userId, roleName)
  }
  approvePayment(id: string, actorId: string) {
    return this.stateService.approvePayment(id, actorId)
  }
  payPayment(id: string, dto: PayPaymentBodyDto, actorId: string) {
    return this.stateService.payPayment(id, dto, actorId)
  }
  cancelPayment(id: string, dto: CancelPaymentBodyDto, actorId: string) {
    return this.stateService.cancelPayment(id, dto, actorId)
  }
  getPaymentsByContract(contractId: string, userId: string, roleName: string) {
    return this.queryService.getPaymentsByContract(contractId, userId, roleName)
  }
  getPaymentsBySeries(seriesId: string, userId: string, roleName: string) {
    return this.queryService.getPaymentsBySeries(seriesId, userId, roleName)
  }
  getPaymentsByUserId(receiverId: string, userId: string, roleName: string) {
    return this.queryService.getPaymentsByUserId(receiverId, userId, roleName)
  }
  createPaymentCondition(contractId: string, editorId: string, dto: CreatePaymentConditionBodyType) {
    return this.conditionService.createPaymentCondition(contractId, editorId, dto)
  }
  getPaymentConditionsByContract(contractId: string, userId: string, roleName: string) {
    return this.conditionService.getPaymentConditionsByContract(contractId, userId, roleName)
  }
  updatePaymentCondition(
    contractId: string,
    conditionId: string,
    editorId: string,
    dto: UpdatePaymentConditionBodyType
  ) {
    return this.conditionService.updatePaymentCondition(contractId, conditionId, editorId, dto)
  }
  disablePaymentCondition(contractId: string, conditionId: string, editorId: string) {
    return this.conditionService.disablePaymentCondition(contractId, conditionId, editorId)
  }
}
