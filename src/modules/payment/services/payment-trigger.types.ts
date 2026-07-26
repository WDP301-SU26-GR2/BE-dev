import { Contract } from '@prisma/client'

export type ContractWithSeries = Contract & {
  series?: {
    id: string
    mangakaId: string
    coOwnerId: string | null
  }
}
