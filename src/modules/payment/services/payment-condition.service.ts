import { Injectable } from '@nestjs/common'
import { ConditionType, ContractStatus, ContractType, PaymentConditionStatus, Prisma } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { PaymentConditionRepo } from '../payment-condition.repo'
import {
  ContractNotFoundForPaymentException,
  PaymentConditionNotEditableException,
  PaymentConditionContractLockedException,
  PaymentConditionNotFoundException,
  UnauthorizedPaymentConditionEditorException,
  PaymentPayoutExceedsCapException,
  PaymentConditionsExceedNewCapException
} from '../errors/payment.error'
import { CreatePaymentConditionBodyType, UpdatePaymentConditionBodyType } from '../schemas/payment-condition-schema'
import { assertRecurringChapterIsRecurring, parseThresholdConfig } from '../validation/payment-condition.validation'
import { PaymentConditionStateService } from './payment-condition-state.service'

@Injectable()
export class PaymentConditionService {
  private readonly capTypes = new Set<ConditionType>([ConditionType.CHAPTER_MILESTONE, ConditionType.TIME_BOUND])

  constructor(
    private readonly paymentConditionRepo: PaymentConditionRepo,
    private readonly conditionState: PaymentConditionStateService
  ) {}

  async createPaymentCondition(contractId: string, editorId: string, dto: CreatePaymentConditionBodyType) {
    const contract = await this.assertEditorOwnsContract(contractId, editorId)
    parseThresholdConfig(dto.conditionType, dto.thresholdConfig)
    assertRecurringChapterIsRecurring(dto.conditionType, dto.isRecurring)
    await this.assertWithinCap(contract, dto)
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
    const contract = await this.assertEditorOwnsContract(contractId, editorId)
    const condition = await this.paymentConditionRepo.findByIdAndContractId(conditionId, contractId)
    if (!condition) throw new PaymentConditionNotFoundException()
    this.assertConditionEditable(condition.status)
    if (dto.thresholdConfig !== undefined) parseThresholdConfig(condition.conditionType, dto.thresholdConfig)
    assertRecurringChapterIsRecurring(condition.conditionType, dto.isRecurring ?? condition.isRecurring)
    await this.assertWithinCap(
      contract,
      {
        conditionType: condition.conditionType,
        payoutAmount: dto.payoutAmount ?? condition.payoutAmount,
        payoutPct: dto.payoutPct ?? condition.payoutPct
      },
      conditionId
    )
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

  async assertExistingConditionsWithinNewCap(
    contractId: string,
    contract: {
      contractType: ContractType
      valuationAmount: number | null
      publisherOwnershipPct: number | null
    }
  ) {
    const cap = this.computeCap(contract)
    const conditions = await this.paymentConditionRepo.findActiveConditionsByContract(contractId)
    const sum = conditions
      .filter((condition) => this.capTypes.has(condition.conditionType))
      .reduce((total, condition) => total + this.amountOf(condition, contract.valuationAmount ?? 0), 0)
    if (sum > cap) throw new PaymentConditionsExceedNewCapException()
  }

  private async assertEditorOwnsContract(contractId: string, editorId: string) {
    const contract = await this.paymentConditionRepo.findContractById(contractId)
    if (!contract) throw new ContractNotFoundForPaymentException()
    if (contract.editorId !== editorId) throw new UnauthorizedPaymentConditionEditorException()
    if (contract.status !== ContractStatus.DRAFT && contract.status !== ContractStatus.BOARD_REVIEW) {
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

  private computeCap(contract: {
    contractType: ContractType
    valuationAmount: number | null
    publisherOwnershipPct: number | null
  }): number {
    const valuation = contract.valuationAmount ?? 0
    if (contract.contractType === ContractType.FULL_BUYOUT) return valuation
    return ((contract.publisherOwnershipPct ?? 0) / 100) * valuation
  }

  private amountOf(condition: { payoutAmount?: number | null; payoutPct?: number | null }, valuation: number): number {
    if (condition.payoutAmount != null) return condition.payoutAmount
    if (condition.payoutPct != null) return (condition.payoutPct / 100) * valuation
    return 0
  }

  private async assertWithinCap(
    contract: {
      id: string
      contractType: ContractType
      valuationAmount: number | null
      publisherOwnershipPct: number | null
    },
    candidate: {
      conditionType: ConditionType
      payoutAmount?: number | null
      payoutPct?: number | null
    },
    excludeConditionId?: string
  ) {
    if (!this.capTypes.has(candidate.conditionType)) return

    const valuation = contract.valuationAmount ?? 0
    const siblings = await this.paymentConditionRepo.findActiveConditionsByContract(contract.id)
    const siblingSum = siblings
      .filter((condition) => condition.id !== excludeConditionId)
      .filter((condition) => this.capTypes.has(condition.conditionType))
      .reduce((total, condition) => total + this.amountOf(condition, valuation), 0)
    const sum = siblingSum + this.amountOf(candidate, valuation)
    if (sum > this.computeCap(contract)) throw new PaymentPayoutExceedsCapException()
  }
}
