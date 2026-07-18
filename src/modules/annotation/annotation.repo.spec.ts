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

    const result = await new AnnotationRepository(prisma as unknown as PrismaService).findByTarget('PAGE', 'p1')

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1)
    expect(toAnnotationRes(result[0]).author?.displayName).toBe('Author')
    expect(result[1].author).toBeNull()
  })
})
