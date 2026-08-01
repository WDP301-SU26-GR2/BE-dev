import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { DomainEvent } from 'src/core/events/domain-events'
import { ContractRepo } from '../contract.repo'

@Injectable()
export class ContractSeriesCancellationListener {
  private readonly logger = new Logger(ContractSeriesCancellationListener.name)

  constructor(private readonly contractRepo: ContractRepo) {}

  @OnEvent(DomainEvent.SeriesCancelling)
  async handleSeriesCancelling(payload: { seriesId: string }) {
    try {
      await this.contractRepo.voidNonExecutedContractsBySeries(payload.seriesId)
    } catch (error) {
      this.logger.error(
        `Failed to void non-executed contracts for cancelling series ${payload.seriesId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }
}
