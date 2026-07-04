import { AnnotationTargetType, AnnotationType } from '@prisma/client'
import { AnnotationService } from './annotation.service'

function makeRepo(over: Record<string, unknown> = {}) {
  return {
    create: jest.fn().mockResolvedValue({ id: 'an1', isResolved: false, createdAt: new Date() }),
    findById: jest.fn().mockResolvedValue({ id: 'an1', authorId: 'u1', isResolved: false, createdAt: new Date() }),
    findByTarget: jest.fn().mockResolvedValue([]),
    targetExists: jest.fn().mockResolvedValue(true),
    setResolved: jest.fn().mockResolvedValue({ id: 'an1', isResolved: true, createdAt: new Date() }),
    delete: jest.fn().mockResolvedValue({ id: 'an1' }),
    ...over
  }
}

const body = {
  targetType: AnnotationTargetType.MANUSCRIPT,
  targetId: '507f1f77bcf86cd799439011',
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

  it('creates annotation for an existing NAME target', async () => {
    const repo = makeRepo()
    const svc = new AnnotationService(repo as never)
    await svc.create('u1', 'EDITOR', { ...body, targetType: AnnotationTargetType.NAME })
    expect(repo.targetExists).toHaveBeenCalledWith(AnnotationTargetType.NAME, body.targetId)
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ targetType: AnnotationTargetType.NAME }))
  })

  it('rejects missing target with 422', async () => {
    const repo = makeRepo({ targetExists: jest.fn().mockResolvedValue(false) })
    const svc = new AnnotationService(repo as never)
    await expect(svc.create('u1', 'EDITOR', body)).rejects.toMatchObject({ status: 422 })
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('rejects malformed target id without repository lookup', async () => {
    const repo = makeRepo()
    const svc = new AnnotationService(repo as never)
    await expect(svc.create('u1', 'EDITOR', { ...body, targetId: 'bad-id' })).rejects.toMatchObject({ status: 422 })
    expect(repo.targetExists).not.toHaveBeenCalled()
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('returns empty list for malformed target id without querying Prisma', async () => {
    const repo = makeRepo()
    const svc = new AnnotationService(repo as never)
    await expect(svc.list(AnnotationTargetType.NAME, 'bad-id')).resolves.toEqual({ items: [] })
    expect(repo.findByTarget).not.toHaveBeenCalled()
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
