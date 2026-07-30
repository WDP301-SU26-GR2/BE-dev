import { Injectable } from '@nestjs/common'
import { ContractStatus, PaymentConditionStatus, Prisma } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { PaymentConditionRepo } from '../payment-condition.repo'
import {
  ContractNotFoundForPaymentException,
  PaymentConditionNotEditableException,
  PaymentConditionContractLockedException,
  PaymentConditionNotFoundException,
  UnauthorizedPaymentConditionEditorException
} from '../errors/payment.error'
import { CreatePaymentConditionBodyType, UpdatePaymentConditionBodyType } from '../schemas/payment-condition-schema'
import { assertRecurringChapterIsRecurring, parseThresholdConfig } from '../validation/payment-condition.validation'
import { PaymentConditionStateService } from './payment-condition-state.service'

@Injectable()
export class PaymentConditionService {
  constructor(
    private readonly paymentConditionRepo: PaymentConditionRepo,
    private readonly conditionState: PaymentConditionStateService
  ) {}

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
    return { data: await this.paymentConditionRepo.findManyByContractId(contract.id) }
  }

  async updatePaymentCondition(
    contractId: string,
    conditionId: string,
    editorId: string,
    dto: UpdatePaymentConditionBodyType
  ) {
    await this.assertEditorOwnsContract(contractId, editorId)
    const condition = await this.paymentConditionRepo.findByIdAndContractId(conditionId, contractId)
    if (!condition) throw new PaymentConditionNotFoundException()
    this.assertConditionEditable(condition.status)
    if (dto.thresholdConfig !== undefined) parseThresholdConfig(condition.conditionType, dto.thresholdConfig)
    assertRecurringChapterIsRecurring(condition.conditionType, dto.isRecurring ?? condition.isRecurring)
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
    if (!condition) throw new PaymentConditionNotFoundException()
    this.assertConditionEditable(condition.status)
    return this.conditionState.disable(condition, editorId)
  }

  private async assertEditorOwnsContract(contractId: string, editorId: string) {
    const contract = await this.paymentConditionRepo.findContractById(contractId)
    if (!contract) throw new ContractNotFoundForPaymentException()
    if (contract.editorId !== editorId) throw new UnauthorizedPaymentConditionEditorException()
    if (contract.status !== ContractStatus.DRAFT && contract.status !== ContractStatus.NEGOTIATION) {
      throw new PaymentConditionContractLockedException()
    }
    return contract
  }

  private async assertContractViewable(contractId: string, userId: string, roleName: string) {
    const contract = await this.paymentConditionRepo.findContractById(contractId)
    if (!contract) throw new ContractNotFoundForPaymentException()
    if (roleName === RoleName.BOARD_MEMBER) return contract
    if (roleName === RoleName.EDITOR && contract.editorId === userId) return contract
    if (roleName === RoleName.MANGAKA && contract.mangakaId === userId) return contract
    throw new UnauthorizedPaymentConditionEditorException()
  }

  private assertConditionEditable(status: PaymentConditionStatus) {
    if (status === PaymentConditionStatus.ACHIEVED || status === PaymentConditionStatus.MISSED) {
      throw new PaymentConditionNotEditableException()
    }
  }
}
