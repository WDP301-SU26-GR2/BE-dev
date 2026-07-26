import { AiSegmentSource, ProductionStageStatus } from '@prisma/client'
import { ChapterNotFoundException, ChapterOnHoldException } from '../errors/chapter.errors'
import {
  StageAccessDeniedException,
  StageHasOpenTasksException,
  StageNotActiveException,
  StageNotFoundException,
  StageOutputInvalidException,
  StagePageNotFoundException
} from '../errors/production-stage.errors'
import { ProductionStagePageService } from './production-stage-page.service'

const chapterId = '0123456789abcdef01234567'
const stageId = 'fedcba987654321001234567'
const pageId = 'aaaaaaaaaaaaaaaaaaaaaaaa'

const page = (overrides: Record<string, unknown> = {}) => ({
  stageId,
  pageId,
  inputFileKey: 'input.png',
  inputSourceType: AiSegmentSource.ORIGINAL,
  inputRevision: 1,
  outputConfirmedAt: null,
  outputFileKey: null,
  outputSourceType: null,
  outputRevision: null,
  outputConfirmedBy: null,
  page: { compositeRevision: 4 },
  ...overrides
})

const createFixture = (options: { chapter?: unknown; series?: unknown } = {}) => {
  const repo = {
    findById: jest.fn().mockResolvedValue({ id: stageId, chapterId, status: ProductionStageStatus.ACTIVE }),
    findStagePages: jest.fn().mockResolvedValue([page()]),
    countOpenTasksForStagePage: jest.fn().mockResolvedValue(0),
    confirmOutputs: jest.fn()
  }
  const chapterRepo = {
    findChapterById: jest
      .fn()
      .mockResolvedValue(
        options.chapter === undefined ? { id: chapterId, seriesId: 's1', hold: null } : options.chapter
      ),
    findSeriesById: jest
      .fn()
      .mockResolvedValue(options.series === undefined ? { id: 's1', mangakaId: 'm1', editorId: 'e1' } : options.series)
  }
  return { repo, chapterRepo, service: new ProductionStagePageService(repo as never, chapterRepo as never) }
}

describe('ProductionStagePageService', () => {
  it('rejects malformed/missing chapter and missing series without leaking persistence errors', async () => {
    const malformed = createFixture()
    await expect(malformed.service.listStagePages({ userId: 'm1', roleName: 'MANGAKA' }, 'bad', stageId)).rejects.toBe(
      ChapterNotFoundException
    )
    expect(malformed.chapterRepo.findChapterById).not.toHaveBeenCalled()

    const noChapter = createFixture({ chapter: null })
    await expect(noChapter.service.confirmOutputs('m1', chapterId, stageId, { items: [] })).rejects.toBe(
      ChapterNotFoundException
    )
    expect(noChapter.chapterRepo.findSeriesById).not.toHaveBeenCalled()

    const noSeries = createFixture({ series: null })
    await expect(noSeries.service.confirmOutputs('m1', chapterId, stageId, { items: [] })).rejects.toBe(
      ChapterNotFoundException
    )
  })

  it.each([
    [{ userId: 'other', roleName: 'MANGAKA' }],
    [{ userId: 'other', roleName: 'EDITOR' }],
    [{ userId: 'm1', roleName: 'ASSISTANT' }]
  ])('denies page reads outside Mangaka/Editor scope', async (actor) => {
    const fixture = createFixture()
    await expect(fixture.service.listStagePages(actor, chapterId, stageId)).rejects.toBe(StageAccessDeniedException)
    expect(fixture.repo.findById).not.toHaveBeenCalled()
  })

  it.each([[{ userId: 'm1', roleName: 'MANGAKA' }], [{ userId: 'e1', roleName: 'EDITOR' }]])(
    'lists mapped stage pages for scoped actor %p',
    async (actor) => {
      const fixture = createFixture()
      fixture.repo.findStagePages.mockResolvedValue([
        page({
          outputConfirmedAt: new Date('2026-07-01T00:00:00.000Z'),
          outputFileKey: 'out.png',
          outputSourceType: AiSegmentSource.COMPOSITE,
          outputRevision: 2,
          outputConfirmedBy: 'm1'
        })
      ])
      await expect(fixture.service.listStagePages(actor, chapterId, stageId)).resolves.toEqual({
        items: [
          expect.objectContaining({
            outputConfirmedAt: '2026-07-01T00:00:00.000Z',
            outputReady: true
          })
        ]
      })
    }
  )

  it.each([[null], [{ id: stageId, chapterId: 'other', status: ProductionStageStatus.ACTIVE }]])(
    'hides missing or cross-chapter stages from page list',
    async (value) => {
      const fixture = createFixture()
      fixture.repo.findById.mockResolvedValue(value)
      await expect(
        fixture.service.listStagePages({ userId: 'm1', roleName: 'MANGAKA' }, chapterId, stageId)
      ).rejects.toBe(StageNotFoundException)
    }
  )

  describe('confirmOutputs', () => {
    it('requires the chapter owner and rejects held chapters before stage mutation', async () => {
      const other = createFixture()
      await expect(other.service.confirmOutputs('other', chapterId, stageId, { items: [] })).rejects.toBe(
        StageAccessDeniedException
      )
      expect(other.repo.findById).not.toHaveBeenCalled()

      const held = createFixture({ chapter: { id: chapterId, seriesId: 's1', hold: { reason: 'pause' } } })
      await expect(held.service.confirmOutputs('m1', chapterId, stageId, { items: [] })).rejects.toBe(
        ChapterOnHoldException
      )
      expect(held.repo.findById).not.toHaveBeenCalled()
    })

    it.each([
      [null, StageNotFoundException],
      [{ id: stageId, chapterId: 'other', status: ProductionStageStatus.ACTIVE }, StageNotFoundException],
      [{ id: stageId, chapterId, status: ProductionStageStatus.LOCKED }, StageNotActiveException]
    ])('requires the exact active stage', async (value, error) => {
      const fixture = createFixture()
      fixture.repo.findById.mockResolvedValue(value)
      await expect(fixture.service.confirmOutputs('m1', chapterId, stageId, { items: [] })).rejects.toBe(error)
    })

    it.each([[{ items: [{ pageId }, { pageId, reuseInput: true as const }] }], [{ items: [] }]])(
      'requires an exact, duplicate-free page set',
      async (body) => {
        const fixture = createFixture()
        await expect(fixture.service.confirmOutputs('m1', chapterId, stageId, body)).rejects.toBe(
          StageOutputInvalidException
        )
      }
    )

    it('rejects an unknown page without checking task state', async () => {
      const fixture = createFixture()
      await expect(
        fixture.service.confirmOutputs('m1', chapterId, stageId, {
          items: [{ pageId: 'bbbbbbbbbbbbbbbbbbbbbbbb', reuseInput: true }]
        })
      ).rejects.toBe(StagePageNotFoundException)
      expect(fixture.repo.countOpenTasksForStagePage).not.toHaveBeenCalled()
    })

    it('rejects a page with open tasks before confirming output', async () => {
      const fixture = createFixture()
      fixture.repo.countOpenTasksForStagePage.mockResolvedValue(1)
      await expect(
        fixture.service.confirmOutputs('m1', chapterId, stageId, { items: [{ pageId, reuseInput: true }] })
      ).rejects.toBe(StageHasOpenTasksException)
      expect(fixture.repo.confirmOutputs).not.toHaveBeenCalled()
    })

    it.each([
      [
        page({
          outputConfirmedAt: new Date(),
          outputFileKey: 'other.png',
          outputSourceType: AiSegmentSource.ORIGINAL,
          outputRevision: 1
        })
      ],
      [
        page({
          outputConfirmedAt: new Date(),
          outputFileKey: 'input.png',
          outputSourceType: AiSegmentSource.COMPOSITE,
          outputRevision: 1
        })
      ],
      [
        page({
          outputConfirmedAt: new Date(),
          outputFileKey: 'input.png',
          outputSourceType: AiSegmentSource.ORIGINAL,
          outputRevision: 2
        })
      ]
    ])('rejects a conflicting retry of confirmed reuse input', async (stored) => {
      const fixture = createFixture()
      fixture.repo.findStagePages.mockResolvedValue([stored])
      await expect(
        fixture.service.confirmOutputs('m1', chapterId, stageId, { items: [{ pageId, reuseInput: true }] })
      ).rejects.toBe(StageOutputInvalidException)
    })

    it('rejects a conflicting retry of a composite output', async () => {
      const fixture = createFixture()
      fixture.repo.findStagePages.mockResolvedValue([
        page({
          outputConfirmedAt: new Date(),
          outputFileKey: 'old.png',
          outputSourceType: AiSegmentSource.COMPOSITE,
          outputRevision: 2
        })
      ])
      await expect(
        fixture.service.confirmOutputs('m1', chapterId, stageId, {
          items: [{ pageId, fileKey: 'new.png' }]
        })
      ).rejects.toBe(StageOutputInvalidException)
    })

    it('returns existing outputs for an idempotent retry without writing', async () => {
      const fixture = createFixture()
      fixture.repo.findStagePages.mockResolvedValue([
        page({
          outputConfirmedAt: new Date('2026-07-01T00:00:00.000Z'),
          outputFileKey: 'input.png',
          outputSourceType: AiSegmentSource.ORIGINAL,
          outputRevision: 1,
          outputConfirmedBy: 'm1'
        })
      ])
      const result = await fixture.service.confirmOutputs('m1', chapterId, stageId, {
        items: [{ pageId, reuseInput: true }]
      })
      expect(result.items[0]).toMatchObject({ outputReady: true, outputFileKey: 'input.png' })
      expect(fixture.repo.confirmOutputs).not.toHaveBeenCalled()
    })

    it('writes a complete page set and maps incomplete readiness safely', async () => {
      const fixture = createFixture()
      fixture.repo.confirmOutputs.mockResolvedValue([
        page({
          outputConfirmedAt: new Date('2026-07-01T00:00:00.000Z'),
          outputFileKey: 'out.png',
          outputSourceType: AiSegmentSource.COMPOSITE,
          outputRevision: null,
          outputConfirmedBy: 'm1'
        })
      ])
      const result = await fixture.service.confirmOutputs('m1', chapterId, stageId, {
        items: [{ pageId, fileKey: 'out.png' }]
      })
      expect(fixture.repo.confirmOutputs).toHaveBeenCalledWith(stageId, 'm1', [
        {
          pageId,
          outputSourceType: AiSegmentSource.COMPOSITE,
          outputFileKey: 'out.png',
          outputRevision: 5,
          compositeUpdate: { fileKey: 'out.png', revision: 5 }
        }
      ])
      expect(result.items[0].outputReady).toBe(false)
    })

    it('turns reuse-input decisions into persistence commands without a composite update', async () => {
      const fixture = createFixture()
      fixture.repo.confirmOutputs.mockResolvedValue([page()])
      await fixture.service.confirmOutputs('m1', chapterId, stageId, {
        items: [{ pageId, reuseInput: true }]
      })
      expect(fixture.repo.confirmOutputs).toHaveBeenCalledWith(stageId, 'm1', [
        {
          pageId,
          outputSourceType: AiSegmentSource.ORIGINAL,
          outputFileKey: 'input.png',
          outputRevision: 1
        }
      ])
    })
  })
})
