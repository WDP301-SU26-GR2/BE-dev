import { AnnotationTargetType, AnnotationType } from '@prisma/client'
import { AnnotationService } from './annotation.service'

function makeRepo(over: Record<string, unknown> = {}) {
  return {
    create: jest.fn().mockResolvedValue({ id: 'an1', isResolved: false, createdAt: new Date() }),
    findById: jest.fn().mockResolvedValue({ id: 'an1', authorId: 'u1', isResolved: false, createdAt: new Date() }),
    findByTarget: jest.fn().mockResolvedValue([]),
    setResolved: jest.fn().mockResolvedValue({ id: 'an1', isResolved: true, createdAt: new Date() }),
    delete: jest.fn().mockResolvedValue({ id: 'an1' }),
    ...over
  }
}

const body = {
  targetType: AnnotationTargetType.MANUSCRIPT,
  targetId: 'm1',
  annotationType: AnnotationType.TEXT,
  content: 'fix'
}

describe('AnnotationService', () => {
  it('creates annotation with author + role', async () => {
    const repo = makeRepo()
    const svc = new AnnotationService(repo as never)
    await svc.create('u1', 'EDITOR', body)
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ authorId: 'u1', authorRole: 'EDITOR' }))
  })

  it('owner can resolve', async () => {
    const repo = makeRepo()
    const svc = new AnnotationService(repo as never)
    await svc.resolve('u1', 'an1')
    expect(repo.setResolved).toHaveBeenCalledWith('an1', true)
  })

  it('non-author cannot resolve (403)', async () => {
    const repo = makeRepo({
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'an1', authorId: 'someone', isResolved: false, createdAt: new Date() })
    })
    const svc = new AnnotationService(repo as never)
    await expect(svc.resolve('u1', 'an1')).rejects.toBeDefined()
  })

  it('not found → 404', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) })
    const svc = new AnnotationService(repo as never)
    await expect(svc.resolve('u1', 'anX')).rejects.toBeDefined()
  })

  it('non-author cannot delete (403)', async () => {
    const repo = makeRepo({
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'an1', authorId: 'someone', isResolved: false, createdAt: new Date() })
    })
    const svc = new AnnotationService(repo as never)
    await expect(svc.remove('u1', 'an1')).rejects.toBeDefined()
  })
})
