import { Injectable } from '@nestjs/common'
import { DatabaseUnitOfWork } from 'src/infrastructure/database/database-unit-of-work.service'
import { ContractTransferPort } from '../ports/contract-transfer.port'
import { SeriesOwnershipPort } from '../ports/series-ownership.port'
import { SigningOtpPort } from '../ports/signing-otp.port'
import { TransferContractStateService } from './transfer-contract-state.service'
import { TransferRequestStateService } from './transfer-request-state.service'

@Injectable()
export class TransferTransactionService {
  constructor(
    private readonly uow?: DatabaseUnitOfWork,
    private readonly contracts?: ContractTransferPort,
    private readonly series?: SeriesOwnershipPort,
    private readonly otp?: SigningOtpPort,
    private readonly requestState?: TransferRequestStateService,
    private readonly contractState?: TransferContractStateService
  ) {}

  require() {
    if (!this.uow || !this.contracts || !this.series || !this.otp || !this.requestState || !this.contractState) {
      throw new Error('Transfer transaction dependencies are not configured')
    }
    return {
      uow: this.uow,
      contracts: this.contracts,
      series: this.series,
      otp: this.otp,
      requestState: this.requestState,
      contractState: this.contractState
    }
  }
}
