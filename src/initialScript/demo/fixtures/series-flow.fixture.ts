import {
  ContractStatus,
  ContractType,
  ManuscriptStatus,
  StoryboardStatus,
  PageStatus,
  ProposalStatus,
  PublicationType,
  SeriesStatus
} from '@prisma/client'
import { DEMO_ITERATIONS, FLOW_ONE_TITLES, FLOW_SIX_TITLES } from '../demo-data'
import { createChapterBundle } from './chapter-builder.fixture'
import { createExecutedContract, ensureApprovedSerializationDecision } from './contract-builder.fixture'
import { DAY, mapWithConcurrency, pad, requiredAccount } from './demo-seed.helpers'
import { DemoContext, SeriesSeed } from './demo-seed.types'
import { createSeriesWithProposal } from './series-builder.fixture'

export const seedFlowOne = async (context: DemoContext) => {
  const { accounts } = context
  const mangakas = ['mangaka.akari', 'mangaka.ren', 'mangaka.sora'].map((alias) => requiredAccount(accounts, alias))
  const editor = requiredAccount(accounts, 'editor.naomi')
  const result: SeriesSeed[] = []

  const runs = await mapWithConcurrency(
    Array.from({ length: DEMO_ITERATIONS }, (_, index) => index),
    3,
    async (index) => {
      const mangaka = mangakas[index % mangakas.length]
      return createSeriesWithProposal(context, {
        title: `[DEMO F1-${pad(index + 1)}] ${FLOW_ONE_TITLES[index]}`,
        mangakaId: mangaka.id,
        seriesStatus: SeriesStatus.DRAFT,
        proposalStatus: ProposalStatus.DRAFT,
        synopsis: `${FLOW_ONE_TITLES[index]} theo chân một nhóm nhân vật trẻ đối mặt với lựa chọn giữa truyền thống và công nghệ. Hồ sơ số ${index + 1} dành cho demo Flow 1 trọn vẹn.`
      })
    }
  )
  result.push(...runs)

  const showcaseStates: Array<{
    suffix: string
    seriesStatus: SeriesStatus
    proposalStatus: ProposalStatus
    assigned: boolean
  }> = [
    {
      suffix: 'Queue — chờ Editor claim',
      seriesStatus: SeriesStatus.IN_REVIEW,
      proposalStatus: ProposalStatus.PROPOSAL_REVIEW,
      assigned: false
    },
    {
      suffix: 'Proposal cần sửa',
      seriesStatus: SeriesStatus.IN_REVIEW,
      proposalStatus: ProposalStatus.PROPOSAL_REVISION,
      assigned: true
    },
    {
      suffix: 'Sẵn sàng pitch',
      seriesStatus: SeriesStatus.READY_TO_PITCH,
      proposalStatus: ProposalStatus.PROPOSAL_APPROVED,
      assigned: true
    }
  ]
  for (const [index, state] of showcaseStates.entries()) {
    await createSeriesWithProposal(context, {
      title: `[DEMO F1-SHOWCASE-${index + 1}] ${state.suffix}`,
      mangakaId: mangakas[index % mangakas.length].id,
      editorId: state.assigned ? editor.id : undefined,
      seriesStatus: state.seriesStatus,
      proposalStatus: state.proposalStatus,
      synopsis: `Bản showcase trạng thái: ${state.suffix}.`
    })
  }
  return result
}

export const seedContractRuns = async (context: DemoContext) => {
  const mangakas = ['mangaka.ren', 'mangaka.sora'].map((alias) => requiredAccount(context.accounts, alias))
  const editor = requiredAccount(context.accounts, 'editor.duc')
  const result: SeriesSeed[] = []

  for (let index = 0; index < DEMO_ITERATIONS; index += 1) {
    const mangaka = mangakas[index % mangakas.length]
    const series = await createSeriesWithProposal(context, {
      title: `[DEMO F6-${pad(index + 1)}] ${FLOW_SIX_TITLES[index]}`,
      mangakaId: mangaka.id,
      editorId: editor.id,
      seriesStatus: SeriesStatus.SERIALIZED,
      proposalStatus: ProposalStatus.APPROVED,
      synopsis: `${FLOW_SIX_TITLES[index]} đã được Board thông qua, sẵn sàng demo soạn và thương lượng hợp đồng lần ${index + 1}.`
    })
    await context.prisma.series.update({
      where: { id: series.id },
      data: {
        publicationType: index % 3 === 0 ? PublicationType.MONTHLY : PublicationType.WEEKLY,
        magazine: index % 3 === 0 ? 'Manga Nexus Monthly' : 'Manga Nexus Weekly',
        startIssueNumber: 120 + index
      }
    })
    const decision = await ensureApprovedSerializationDecision(context, series)
    const contract = await context.prisma.contract.create({
      data: {
        seriesId: series.id,
        mangakaId: mangaka.id,
        editorId: editor.id,
        boardDecisionId: decision.id,
        contractType: index % 4 === 0 ? ContractType.FULL_BUYOUT : ContractType.REVENUE_SHARE,
        valuationAmount: 180_000_000 + index * 15_000_000,
        publisherOwnershipPct: index % 4 === 0 ? 100 : 70,
        mangakaOwnershipPct: index % 4 === 0 ? 0 : 30,
        terminationClause: 'Các mốc đã đạt vẫn được thanh toán; compensation theo phụ lục demo.',
        contractStart: new Date(context.now.getTime() + 7 * DAY),
        contractEnd: new Date(context.now.getTime() + 730 * DAY),
        status: ContractStatus.DRAFT
      }
    })
    await context.prisma.contractVersion.create({
      data: {
        contractId: contract.id,
        versionNumber: 1,
        valuationAmount: contract.valuationAmount,
        publisherOwnershipPct: contract.publisherOwnershipPct,
        mangakaOwnershipPct: contract.mangakaOwnershipPct,
        terminationClause: contract.terminationClause,
        editedById: editor.id,
        note: 'Bản nháp đầu để Editor gửi Board review nội bộ trước khi chuyển sang Mangaka.',
        createdAt: context.now
      }
    })
    result.push(series)
  }
  return result
}

export const seedRankingRoster = async (context: DemoContext) => {
  const mangakas = ['mangaka.akari', 'mangaka.ren', 'mangaka.sora'].map((alias) =>
    requiredAccount(context.accounts, alias)
  )
  const editors = ['editor.naomi', 'editor.duc'].map((alias) => requiredAccount(context.accounts, alias))
  const result: SeriesSeed[] = []

  for (let index = 0; index < DEMO_ITERATIONS; index += 1) {
    const mangaka = mangakas[index % mangakas.length]
    const editor = editors[index % editors.length]
    const series = await createSeriesWithProposal(context, {
      title: `[DEMO RANK-${pad(index + 1)}] Biên niên sử ${pad(index + 1)}`,
      mangakaId: mangaka.id,
      editorId: editor.id,
      seriesStatus: SeriesStatus.SERIALIZED,
      proposalStatus: ProposalStatus.APPROVED,
      synopsis: `Series đã ký hợp đồng và xuất bản đủ 8 chương, dùng cho ranking 14 kỳ và Board lifecycle lần ${index + 1}.`
    })
    await context.prisma.series.update({
      where: { id: series.id },
      data: {
        publicationType: PublicationType.WEEKLY,
        magazine: 'Manga Nexus Weekly',
        startIssueNumber: 80 + index
      }
    })
    await createExecutedContract(context, series)
    for (let chapterNumber = 1; chapterNumber <= 8; chapterNumber += 1) {
      await createChapterBundle(context, series, {
        chapterNumber,
        title: `Biên niên sử ${pad(index + 1)} — Chương ${chapterNumber}`,
        storyboardStatus: StoryboardStatus.APPROVED,
        manuscriptStatus: ManuscriptStatus.PUBLISHED,
        pageStatus: PageStatus.COMPLETED,
        pageCount: 1,
        publishedAt: new Date(context.now.getTime() - (80 - chapterNumber - index) * DAY)
      })
    }
    result.push(series)
  }
  return result
}

export const seedMonthlyRankingRoster = async (context: DemoContext) => {
  const mangakas = ['mangaka.akari', 'mangaka.ren', 'mangaka.sora'].map((alias) =>
    requiredAccount(context.accounts, alias)
  )
  const editors = ['editor.naomi', 'editor.duc'].map((alias) => requiredAccount(context.accounts, alias))
  const result: SeriesSeed[] = []

  for (let index = 0; index < DEMO_ITERATIONS; index += 1) {
    const mangaka = mangakas[index % mangakas.length]
    const editor = editors[index % editors.length]
    const series = await createSeriesWithProposal(context, {
      title: `[DEMO RANK-MONTHLY-${pad(index + 1)}] Monthly showcase ${pad(index + 1)}`,
      mangakaId: mangaka.id,
      editorId: editor.id,
      seriesStatus: SeriesStatus.SERIALIZED,
      proposalStatus: ProposalStatus.APPROVED,
      synopsis: `Monthly series with an executed contract and eight published chapters for Flow 4 demo run ${index + 1}.`
    })
    await context.prisma.series.update({
      where: { id: series.id },
      data: {
        publicationType: PublicationType.MONTHLY,
        magazine: 'Manga Nexus Monthly',
        startIssueNumber: 180 + index
      }
    })
    await createExecutedContract(context, series)
    for (let chapterNumber = 1; chapterNumber <= 8; chapterNumber += 1) {
      await createChapterBundle(context, series, {
        chapterNumber,
        title: `Monthly showcase ${pad(index + 1)} - Chapter ${chapterNumber}`,
        storyboardStatus: StoryboardStatus.APPROVED,
        manuscriptStatus: ManuscriptStatus.PUBLISHED,
        pageStatus: PageStatus.COMPLETED,
        pageCount: 1,
        publishedAt: new Date(context.now.getTime() - (80 - chapterNumber - index) * DAY)
      })
    }
    result.push(series)
  }
  return result
}
