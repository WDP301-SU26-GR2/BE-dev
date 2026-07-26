import { PrismaClient } from '@prisma/client'
import { SeededAccount, SeededMedia } from '../demo-db'

export interface DemoSeedSummary {
  accounts: number
  media: number
  series: number
  chapters: number
  pages: number
  tasks: number
  aiJobs: number
  surveyPeriods: number
  rankingRecords: number
  boardDecisions: number
  contracts: number
  paymentConditions: number
  paymentRecords: number
}

export interface DemoContext {
  prisma: PrismaClient
  accounts: Map<string, SeededAccount>
  media: Map<string, SeededMedia>
  now: Date
}

export interface SeriesSeed {
  id: string
  mangakaId: string
  editorId: string
  title: string
}
