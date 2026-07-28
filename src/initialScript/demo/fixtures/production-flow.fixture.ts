import { ManuscriptStatus, NameStatus, PageStatus, ProposalStatus, PublicationType, SeriesStatus } from '@prisma/client'
import { DEMO_ITERATIONS } from '../demo-data'
import { createChapterBundle } from './chapter-builder.fixture'
import { createExecutedContract } from './contract-builder.fixture'
import { DAY, pad, requiredAccount } from './demo-seed.helpers'
import { DemoContext, SeriesSeed } from './demo-seed.types'
import { seedProductionStages } from './production-stage.fixture'
import { createSeriesWithProposal } from './series-builder.fixture'
import { seedStudioAssignments, seedTasksForInkingRun } from './studio-task.fixture'

export const seedProductionHero = async (context: DemoContext): Promise<SeriesSeed> => {
  const mangaka = requiredAccount(context.accounts, 'mangaka.akari')
  const editor = requiredAccount(context.accounts, 'editor.naomi')
  const hero = await createSeriesWithProposal(context, {
    title: '[DEMO F2-F3] Go Go! Encyclopedia Girls — licensed production study',
    mangakaId: mangaka.id,
    editorId: editor.id,
    seriesStatus: SeriesStatus.SERIALIZED,
    proposalStatus: ProposalStatus.APPROVED,
    nameStatus: NameStatus.APPROVED,
    nameVersion: 5,
    synopsis:
      'Production study dùng các trang thật của Go Go! Encyclopedia Girls (Kasuga, CC BY-SA 3.0) để demo Name → Stage → Page → Region → Task → Manuscript.'
  })
  await context.prisma.series.update({
    where: { id: hero.id },
    data: { publicationType: PublicationType.WEEKLY, magazine: 'Manga Nexus Weekly', startIssueNumber: 101 }
  })

  await createExecutedContract(context, hero)
  for (let chapterNumber = 1; chapterNumber <= 8; chapterNumber += 1) {
    const published = await createChapterBundle(context, hero, {
      chapterNumber,
      title: `Arc mở đầu — Chương ${chapterNumber}`,
      nameStatus: NameStatus.APPROVED,
      manuscriptStatus: ManuscriptStatus.PUBLISHED,
      pageStatus: PageStatus.COMPLETED,
      pageCount: 4,
      publishedAt: new Date(context.now.getTime() - (30 - chapterNumber) * DAY)
    })
    await seedProductionStages(context, hero, published.chapter.id, published.pages, 'COMPLETED')
  }

  for (let index = 0; index < DEMO_ITERATIONS; index += 1) {
    await createChapterBundle(context, hero, {
      chapterNumber: 101 + index,
      title: `[DEMO F2-${pad(index + 1)}] Name review run`,
      nameStatus: NameStatus.SUBMITTED,
      manuscriptStatus: ManuscriptStatus.DRAFT,
      pageCount: 0
    })
  }

  await seedStudioAssignments(context, hero)
  const productionInputs = ['rough-drafting', 'hokusai-sketchbook', 'manga-page-cc0'] as const
  for (let index = 0; index < DEMO_ITERATIONS; index += 1) {
    const workshop = await createChapterBundle(context, hero, {
      chapterNumber: 50 + index,
      title: `[DEMO F3-${pad(index + 1)}] INKING production run độc lập`,
      nameStatus: NameStatus.APPROVED,
      manuscriptStatus: ManuscriptStatus.IN_PRODUCTION,
      pageStatus: PageStatus.DRAFT,
      pageCount: 3,
      pageMediaSlugs: productionInputs
    })
    const { activeStage } = await seedProductionStages(
      context,
      hero,
      workshop.chapter.id,
      workshop.pages,
      'ACTIVE_INKING'
    )
    if (!activeStage) throw new Error(`Missing ACTIVE INKING stage for demo run ${index + 1}`)
    await seedTasksForInkingRun(context, index, activeStage.id, workshop.pages)
  }

  const editorReview = await createChapterBundle(context, hero, {
    chapterNumber: 70,
    title: '[DEMO F2] Bản thảo đang chờ Editor',
    nameStatus: NameStatus.APPROVED,
    manuscriptStatus: ManuscriptStatus.EDITOR_REVIEW,
    pageStatus: PageStatus.COMPLETED,
    pageCount: 4
  })
  await seedProductionStages(context, hero, editorReview.chapter.id, editorReview.pages, 'COMPLETED')
  const revision = await createChapterBundle(context, hero, {
    chapterNumber: 71,
    title: '[DEMO F2] Editor trả sửa bản thảo',
    nameStatus: NameStatus.APPROVED,
    manuscriptStatus: ManuscriptStatus.EDITOR_REVISION,
    pageStatus: PageStatus.REVISING,
    pageCount: 4
  })
  await seedProductionStages(context, hero, revision.chapter.id, revision.pages, 'COMPLETED')
  await context.prisma.revisionRequest.create({
    data: {
      targetType: 'MANUSCRIPT',
      targetId: revision.chapter.id,
      seriesId: hero.id,
      round: 2,
      reason: 'Trang 2 cần rút gọn thoại và tăng khoảng lặng trước cliffhanger.',
      requestedBy: editor.id,
      recipientId: mangaka.id
    }
  })
  await context.prisma.annotation.create({
    data: {
      authorId: editor.id,
      targetType: 'PAGE',
      targetId: revision.pageIds[1],
      coordinates: { x: 720, y: 130, width: 390, height: 240 },
      reviewStage: 'EDITOR',
      authorRole: 'EDITOR',
      annotationType: 'HIGHLIGHT',
      content: 'Rút gọn bubble này còn một câu, giữ nhịp chuyển cảnh.'
    }
  })
  const ready = await createChapterBundle(context, hero, {
    chapterNumber: 72,
    title: '[DEMO F2] Sẵn sàng xuất bản',
    nameStatus: NameStatus.APPROVED,
    manuscriptStatus: ManuscriptStatus.READY_FOR_PRINT,
    pageStatus: PageStatus.COMPLETED,
    pageCount: 4
  })
  await seedProductionStages(context, hero, ready.chapter.id, ready.pages, 'COMPLETED')
  return hero
}
