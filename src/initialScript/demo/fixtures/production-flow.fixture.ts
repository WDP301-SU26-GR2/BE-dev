import { ManuscriptStatus, NameStatus, PageStatus, ProposalStatus, PublicationType, SeriesStatus } from '@prisma/client'
import { DEMO_ITERATIONS } from '../demo-data'
import { createChapterBundle } from './chapter-builder.fixture'
import { createExecutedContract } from './contract-builder.fixture'
import { DAY, pad, requiredAccount } from './demo-seed.helpers'
import { DemoContext, SeriesSeed } from './demo-seed.types'
import { createSeriesWithProposal } from './series-builder.fixture'
import { seedStudioAndTasks } from './studio-task.fixture'

export const seedProductionHero = async (context: DemoContext): Promise<SeriesSeed> => {
  const mangaka = requiredAccount(context.accounts, 'mangaka.akari')
  const editor = requiredAccount(context.accounts, 'editor.naomi')
  const hero = await createSeriesWithProposal(context, {
    title: '[DEMO F2-F3] Neon Ronin: Echoes of Edo',
    mangakaId: mangaka.id,
    editorId: editor.id,
    seriesStatus: SeriesStatus.SERIALIZED,
    proposalStatus: ProposalStatus.APPROVED,
    nameStatus: NameStatus.APPROVED,
    nameVersion: 5,
    synopsis:
      'Một kiếm sĩ bảo vệ ký ức của Edo trong Tokyo tương lai. Series chính để demo Name → Page → Region → Task → Manuscript.'
  })
  await context.prisma.series.update({
    where: { id: hero.id },
    data: { publicationType: PublicationType.WEEKLY, magazine: 'Manga Nexus Weekly', startIssueNumber: 101 }
  })

  await createExecutedContract(context, hero)
  for (let chapterNumber = 1; chapterNumber <= 8; chapterNumber += 1) {
    await createChapterBundle(context, hero, {
      chapterNumber,
      title: `Arc mở đầu — Chương ${chapterNumber}`,
      nameStatus: NameStatus.APPROVED,
      manuscriptStatus: ManuscriptStatus.PUBLISHED,
      pageStatus: PageStatus.COMPLETED,
      pageCount: 4,
      publishedAt: new Date(context.now.getTime() - (30 - chapterNumber) * DAY)
    })
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

  const workshop = await createChapterBundle(context, hero, {
    chapterNumber: 50,
    title: '[DEMO F3] Workshop — 10 trang phân việc song song',
    nameStatus: NameStatus.APPROVED,
    manuscriptStatus: ManuscriptStatus.IN_PRODUCTION,
    pageStatus: PageStatus.DRAFT,
    pageCount: DEMO_ITERATIONS
  })
  await seedStudioAndTasks(context, hero, workshop.pageIds)

  await createChapterBundle(context, hero, {
    chapterNumber: 51,
    title: '[DEMO F2] Bản thảo đang chờ Editor',
    nameStatus: NameStatus.APPROVED,
    manuscriptStatus: ManuscriptStatus.EDITOR_REVIEW,
    pageStatus: PageStatus.COMPLETED,
    pageCount: 4
  })
  const revision = await createChapterBundle(context, hero, {
    chapterNumber: 52,
    title: '[DEMO F2] Editor trả sửa bản thảo',
    nameStatus: NameStatus.APPROVED,
    manuscriptStatus: ManuscriptStatus.EDITOR_REVISION,
    pageStatus: PageStatus.REVISING,
    pageCount: 4
  })
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
  await createChapterBundle(context, hero, {
    chapterNumber: 53,
    title: '[DEMO F2] Sẵn sàng xuất bản',
    nameStatus: NameStatus.APPROVED,
    manuscriptStatus: ManuscriptStatus.READY_FOR_PRINT,
    pageStatus: PageStatus.COMPLETED,
    pageCount: 4
  })
  return hero
}
