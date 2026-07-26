import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { PaymentRecordCommandRepository } from './repositories/payment-record-command.repository'
import { PaymentRecordQueryRepository } from './repositories/payment-record-query.repository'

@Injectable()
export class PaymentRecordRepo {
  private readonly queries: PaymentRecordQueryRepository
  private readonly commands: PaymentRecordCommandRepository

  constructor(private readonly prisma: PrismaService) {
    this.queries = new PaymentRecordQueryRepository(prisma)
    this.commands = new PaymentRecordCommandRepository(prisma)
  }

  get create(): typeof this.commands.create {
    return this.commands.create.bind(this.commands) as typeof this.commands.create
  }
  get update(): typeof this.commands.update {
    return this.commands.update.bind(this.commands) as typeof this.commands.update
  }
  get updateWithExpectedStatus(): typeof this.commands.updateWithExpectedStatus {
    return this.commands.updateWithExpectedStatus.bind(this.commands) as typeof this.commands.updateWithExpectedStatus
  }
  get findById(): typeof this.queries.findById {
    return this.queries.findById.bind(this.queries) as typeof this.queries.findById
  }
  get findUserById(): typeof this.queries.findUserById {
    return this.queries.findUserById.bind(this.queries) as typeof this.queries.findUserById
  }
  get findSeriesOwners(): typeof this.queries.findSeriesOwners {
    return this.queries.findSeriesOwners.bind(this.queries) as typeof this.queries.findSeriesOwners
  }
  get findMany(): typeof this.queries.findMany {
    return this.queries.findMany.bind(this.queries) as typeof this.queries.findMany
  }
  get findEligibleContracts(): typeof this.queries.findEligibleContracts {
    return this.queries.findEligibleContracts.bind(this.queries) as typeof this.queries.findEligibleContracts
  }
  get findContractForPaymentEngine(): typeof this.queries.findContractForPaymentEngine {
    return this.queries.findContractForPaymentEngine.bind(
      this.queries
    ) as typeof this.queries.findContractForPaymentEngine
  }
  get findConditionsBySeries(): typeof this.queries.findConditionsBySeries {
    return this.queries.findConditionsBySeries.bind(this.queries) as typeof this.queries.findConditionsBySeries
  }
  get findPendingTimeBoundConditions(): typeof this.queries.findPendingTimeBoundConditions {
    return this.queries.findPendingTimeBoundConditions.bind(
      this.queries
    ) as typeof this.queries.findPendingTimeBoundConditions
  }
  get findRankingConditions(): typeof this.queries.findRankingConditions {
    return this.queries.findRankingConditions.bind(this.queries) as typeof this.queries.findRankingConditions
  }
  get existsPayment(): typeof this.queries.existsPayment {
    return this.queries.existsPayment.bind(this.queries) as typeof this.queries.existsPayment
  }
  get createTriggeredPayment(): typeof this.commands.createTriggeredPayment {
    return this.commands.createTriggeredPayment.bind(this.commands) as typeof this.commands.createTriggeredPayment
  }
  get markConditionAchieved(): typeof this.commands.markConditionAchieved {
    return this.commands.markConditionAchieved.bind(this.commands) as typeof this.commands.markConditionAchieved
  }
  get updateConditionLastTriggeredValue(): typeof this.commands.updateConditionLastTriggeredValue {
    return this.commands.updateConditionLastTriggeredValue.bind(
      this.commands
    ) as typeof this.commands.updateConditionLastTriggeredValue
  }
  get markConditionMissed(): typeof this.commands.markConditionMissed {
    return this.commands.markConditionMissed.bind(this.commands) as typeof this.commands.markConditionMissed
  }
  get markPendingConditionsMissedByContract(): typeof this.commands.markPendingConditionsMissedByContract {
    return this.commands.markPendingConditionsMissedByContract.bind(
      this.commands
    ) as typeof this.commands.markPendingConditionsMissedByContract
  }
  get findExecutedTransferContractBySeriesId(): typeof this.queries.findExecutedTransferContractBySeriesId {
    return this.queries.findExecutedTransferContractBySeriesId.bind(
      this.queries
    ) as typeof this.queries.findExecutedTransferContractBySeriesId
  }
  get pauseTimeBoundConditions(): typeof this.commands.pauseTimeBoundConditions {
    return this.commands.pauseTimeBoundConditions.bind(this.commands) as typeof this.commands.pauseTimeBoundConditions
  }
  get findDisabledTimeBoundConditions(): typeof this.queries.findDisabledTimeBoundConditions {
    return this.queries.findDisabledTimeBoundConditions.bind(
      this.queries
    ) as typeof this.queries.findDisabledTimeBoundConditions
  }
  get resumeTimeBoundCondition(): typeof this.commands.resumeTimeBoundCondition {
    return this.commands.resumeTimeBoundCondition.bind(this.commands) as typeof this.commands.resumeTimeBoundCondition
  }
  get terminateContractsBySeries(): typeof this.commands.terminateContractsBySeries {
    return this.commands.terminateContractsBySeries.bind(
      this.commands
    ) as typeof this.commands.terminateContractsBySeries
  }
}
