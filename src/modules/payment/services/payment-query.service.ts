import { Injectable } from '@nestjs/common'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { RoleName } from 'src/core/security/constants/role.constant'
import { GetPaymentsQueryDto } from '../dto/payment.dto'
import { PaymentAccessDeniedException, PaymentRecordNotFoundException } from '../errors/payment.error'
import { PaymentConditionRepo } from '../payment-condition.repo'
import { PaymentRecordRepo } from '../payment.repo'

@Injectable()
export class PaymentQueryService {
  constructor(
    private readonly paymentRepo: PaymentRecordRepo,
    private readonly paymentConditionRepo: PaymentConditionRepo
  ) {}

  async getPayments(query: GetPaymentsQueryDto) {
    return { data: await this.paymentRepo.findMany(query) }
  }

  async getPaymentById(id: string, userId: string, roleName: string) {
    const payment = await this.loadPaymentOrThrow(id)
    await this.assertPaymentViewable(payment, userId, roleName)
    return payment
  }

  async getPaymentsByContract(contractId: string, userId: string, roleName: string) {
    if (!isObjectId(contractId)) return { data: [] }
    await this.assertContractPaymentsViewable(contractId, userId, roleName)
    return { data: await this.paymentRepo.findMany({ contractId }) }
  }

  async getPaymentsBySeries(seriesId: string, userId: string, roleName: string) {
    if (!isObjectId(seriesId)) return { data: [] }
    await this.assertSeriesPaymentsViewable(seriesId, userId, roleName)
    return { data: await this.paymentRepo.findMany({ seriesId }) }
  }

  async getPaymentsByUserId(receiverId: string, userId: string, roleName: string) {
    if (!isObjectId(receiverId)) return { data: [] }
    if (!this.isPrivileged(roleName) && receiverId !== userId) throw new PaymentAccessDeniedException()
    return { data: await this.paymentRepo.findMany({ receiverId }) }
  }

  private async loadPaymentOrThrow(id: string) {
    if (!isObjectId(id)) throw new PaymentRecordNotFoundException()
    const payment = await this.paymentRepo.findById(id)
    if (!payment) throw new PaymentRecordNotFoundException()
    return payment
  }

  private isPrivileged(roleName: string) {
    return roleName === RoleName.BOARD_MEMBER || roleName === RoleName.SUPER_ADMIN
  }

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
}
