import { Injectable } from '@nestjs/common'
import { transactionClient } from 'src/infrastructure/database/transaction-context'
import { SeriesOwnershipPort } from 'src/modules/transfer/ports/series-ownership.port'

@Injectable()
export class SeriesOwnershipAdapter implements SeriesOwnershipPort {
  async transferOwnership(
    context: Parameters<SeriesOwnershipPort['transferOwnership']>[0],
    command: Parameters<SeriesOwnershipPort['transferOwnership']>[1]
  ): Promise<void> {
    await transactionClient(context).series.update({
      where: { id: command.seriesId },
      data: {
        mangakaId: command.mangakaId,
        coOwnerId: command.coOwnerId,
        coOwnerApprovalRequired: command.coOwnerApprovalRequired
      }
    })
  }
}
