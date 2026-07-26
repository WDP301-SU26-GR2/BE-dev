import { hash, requiredAccount } from './demo-seed.helpers'
import { DemoContext, SeriesSeed } from './demo-seed.types'

export const seedPortfolioMetadata = async (context: DemoContext, hero: SeriesSeed, contractSeries: SeriesSeed[]) => {
  const editor = requiredAccount(context.accounts, 'editor.duc')
  await context.prisma.publicationVersion.createMany({
    data: [
      {
        seriesId: hero.id,
        language: 'JA',
        readingDirection: 'RTL',
        versionType: 'ORIGINAL',
        notes: 'Bản gốc Nhật, đọc phải sang trái.'
      },
      {
        seriesId: hero.id,
        language: 'VI',
        readingDirection: 'LTR',
        versionType: 'DIGITAL',
        notes: 'Bản demo tiếng Việt.'
      }
    ]
  })
  for (const [index, series] of contractSeries.slice(-3).entries()) {
    for (let volume = 1; volume <= 4; volume += 1) {
      await context.prisma.tankobonSales.create({
        data: {
          seriesId: series.id,
          volumeNumber: volume,
          unitsSold: 12_000 + index * 4_500 + volume * 2_300,
          period: `2026-Q${Math.min(4, volume)}`,
          recordedBy: editor.id
        }
      })
    }
  }
}

export const seedNotifications = async (context: DemoContext, flowOne: SeriesSeed[], hero: SeriesSeed) => {
  const editor = requiredAccount(context.accounts, 'editor.naomi')
  const mangaka = requiredAccount(context.accounts, 'mangaka.akari')
  const rows = [
    ...flowOne.map((series, index) => ({
      recipientId: editor.id,
      type: 'REVIEW' as const,
      referenceId: series.id,
      referenceType: 'SERIES_SUBMITTED',
      content: `[DEMO ${index + 1}] Proposal mới sẵn sàng nộp và review.`
    })),
    {
      recipientId: mangaka.id,
      type: 'DEADLINE' as const,
      referenceId: hero.id,
      referenceType: 'SERIES_PRODUCTION_OVERVIEW',
      content: 'Neon Ronin có 10 trang production với task ở nhiều trạng thái để demo.'
    }
  ]
  await context.prisma.notification.createMany({
    data: rows.map((row) => ({ ...row, dedupeKey: hash(`${row.recipientId}|${row.referenceId}|${row.referenceType}`) }))
  })
}
