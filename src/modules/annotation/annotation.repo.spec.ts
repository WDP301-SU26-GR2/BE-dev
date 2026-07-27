import { AnnotationTargetType } from '@prisma/client'
import { AnnotationRepository } from './annotation.repo'
import { toAnnotationRes } from './annotation.mapper'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

describe('AnnotationRepository response enrichment', () => {
  it('batches authors and maps a dangling author id to null', async () => {
    const createdAt = new Date('2026-07-18T00:00:00.000Z')
    const rows = [
      { id: 'a1', authorId: 'u1', createdAt },
      { id: 'a2', authorId: 'missing', createdAt }
    ]
    const prisma = {
      annotation: { findMany: jest.fn().mockResolvedValue(rows) },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u1', name: 'Author', displayName: null, avatar: null }])
      },
      series: { findMany: jest.fn() }
    }

    const result = await new AnnotationRepository(prisma as unknown as PrismaService).findByTarget('PAGE', 'p1', {
      limit: 20,
      offset: 0
    })

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1)
    expect(toAnnotationRes(result[0]).author?.displayName).toBe('Author')
    expect(result[1].author).toBeNull()
  })

  it('returns no scoped annotations without querying Prisma for an empty task scope', async () => {
    const prisma = { annotation: { findMany: jest.fn() } }
    const repository = new AnnotationRepository(prisma as unknown as PrismaService)

    await expect(
      repository.findByTargetForTaskIds(AnnotationTargetType.PAGE, 'p1', [], { limit: 20, offset: 0 })
    ).resolves.toEqual([])
    expect(prisma.annotation.findMany).not.toHaveBeenCalled()
  })

  it.each([
    [AnnotationTargetType.PAGE, 'page', { chapter: { series: { mangakaId: 'm1', editorId: 'e1' } } }],
    [AnnotationTargetType.REGION, 'region', { page: { chapter: { series: { mangakaId: 'm1', editorId: 'e1' } } } }],
    [AnnotationTargetType.MANUSCRIPT, 'manuscript', { chapter: { series: { mangakaId: 'm1', editorId: 'e1' } } }],
    [AnnotationTargetType.NAME, 'name', { series: { mangakaId: 'm1', editorId: 'e1' } }]
  ] as const)('loads %s target ownership context', async (targetType, model, row) => {
    const prisma = {
      page: { findUnique: jest.fn() },
      region: { findUnique: jest.fn() },
      manuscript: { findUnique: jest.fn() },
      name: { findUnique: jest.fn() }
    }
    prisma[model].findUnique.mockResolvedValue(row)

    await expect(
      new AnnotationRepository(prisma as unknown as PrismaService).findTargetContext(targetType, 'target-1')
    ).resolves.toEqual({
      mangakaId: 'm1',
      editorId: 'e1',
      task: null
    })
  })

  it('loads task context with its owning page and returns null when either resource is missing', async () => {
    const prisma = {
      task: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 't1', pageId: 'p1', regionIds: ['r1'], assistantId: 'a1' })
          .mockResolvedValueOnce(null)
      },
      page: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ chapter: { series: { mangakaId: 'm1', editorId: null } } })
          .mockResolvedValueOnce(null)
      }
    }
    const repository = new AnnotationRepository(prisma as unknown as PrismaService)

    await expect(repository.findTargetContext(AnnotationTargetType.TASK, 't1')).resolves.toEqual({
      mangakaId: 'm1',
      editorId: null,
      task: { id: 't1', pageId: 'p1', regionIds: ['r1'], assistantId: 'a1' }
    })
    await expect(repository.findTargetContext(AnnotationTargetType.TASK, 'missing')).resolves.toBeNull()
  })

  it('returns assigned task ids only for page and region annotation targets', async () => {
    const prisma = { task: { findMany: jest.fn().mockResolvedValue([{ id: 't1' }, { id: 't2' }]) } }
    const repository = new AnnotationRepository(prisma as unknown as PrismaService)

    await expect(repository.findAssignedTaskIdsForTarget('a1', AnnotationTargetType.PAGE, 'p1')).resolves.toEqual([
      't1',
      't2'
    ])
    await expect(repository.findAssignedTaskIdsForTarget('a1', AnnotationTargetType.REGION, 'r1')).resolves.toEqual([
      't1',
      't2'
    ])
    await expect(repository.findAssignedTaskIdsForTarget('a1', AnnotationTargetType.NAME, 'n1')).resolves.toEqual([])
    expect(prisma.task.findMany).toHaveBeenCalledTimes(2)
  })
})
