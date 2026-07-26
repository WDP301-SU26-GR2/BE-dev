import { AnnotationTargetType, AnnotationType } from '@prisma/client'
import { AnnotationService } from './annotation.service'

function makeRepo(over: Record<string, unknown> = {}) {
  return {
    create: jest.fn().mockResolvedValue({ id: 'an1', isResolved: false, createdAt: new Date() }),
    findById: jest.fn().mockResolvedValue({ id: 'an1', authorId: 'u1', isResolved: false, createdAt: new Date() }),
    findByTarget: jest.fn().mockResolvedValue([]),
    findByTargetForTaskIds: jest.fn().mockResolvedValue([]),
    setResolved: jest.fn().mockResolvedValue({ id: 'an1', isResolved: true, createdAt: new Date() }),
    delete: jest.fn().mockResolvedValue({ id: 'an1' }),
    ...over
  }
}

function makeAccess(over: Record<string, unknown> = {}) {
  return {
    assertCanCreate: jest.fn().mockResolvedValue(undefined),
    assertTaskBinding: jest.fn().mockResolvedValue(undefined),
    listScope: jest.fn().mockResolvedValue({ taskIds: null }),
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
    const access = makeAccess()
    const svc = new AnnotationService(repo as never, access as never)
    await svc.create('u1', 'EDITOR', body)
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ authorId: 'u1', authorRole: 'EDITOR' }))
    expect(access.assertCanCreate).toHaveBeenCalledWith(
      { userId: 'u1', roleName: 'EDITOR' },
      AnnotationTargetType.MANUSCRIPT,
      body.targetId
    )
  })

  it('delegates task-target consistency to access policy', async () => {
    const repo = makeRepo()
    const access = makeAccess()
    const svc = new AnnotationService(repo as never, access as never)
    await svc.create('u1', 'EDITOR', { ...body, targetType: AnnotationTargetType.PAGE, taskId: 'task-1' })
    expect(access.assertTaskBinding).toHaveBeenCalledWith(AnnotationTargetType.PAGE, body.targetId, 'task-1')
  })

  it('does not persist when access policy rejects the target', async () => {
    const repo = makeRepo()
    const access = makeAccess({ assertCanCreate: jest.fn().mockRejectedValue(new Error('forbidden')) })
    const svc = new AnnotationService(repo as never, access as never)
    await expect(svc.create('u1', 'EDITOR', body)).rejects.toThrow('forbidden')
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('uses a scoped query for an Assistant page/region view', async () => {
    const repo = makeRepo()
    const access = makeAccess({ listScope: jest.fn().mockResolvedValue({ taskIds: ['t1'] }) })
    const svc = new AnnotationService(repo as never, access as never)
    await svc.list('assistant-1', 'ASSISTANT', AnnotationTargetType.PAGE, body.targetId)
    expect(repo.findByTargetForTaskIds).toHaveBeenCalledWith(AnnotationTargetType.PAGE, body.targetId, ['t1'])
    expect(repo.findByTarget).not.toHaveBeenCalled()
  })

  it('owner can resolve', async () => {
    const repo = makeRepo()
    const svc = new AnnotationService(repo as never, makeAccess() as never)
    await svc.resolve('u1', 'an1')
    expect(repo.setResolved).toHaveBeenCalledWith('an1', true)
  })

  it('non-author cannot resolve (403)', async () => {
    const repo = makeRepo({
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'an1', authorId: 'someone', isResolved: false, createdAt: new Date() })
    })
    const svc = new AnnotationService(repo as never, makeAccess() as never)
    await expect(svc.resolve('u1', 'an1')).rejects.toBeDefined()
  })

  it('not found → 404', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) })
    const svc = new AnnotationService(repo as never, makeAccess() as never)
    await expect(svc.resolve('u1', 'anX')).rejects.toBeDefined()
  })

  it('non-author cannot delete (403)', async () => {
    const repo = makeRepo({
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'an1', authorId: 'someone', isResolved: false, createdAt: new Date() })
    })
    const svc = new AnnotationService(repo as never, makeAccess() as never)
    await expect(svc.remove('u1', 'an1')).rejects.toBeDefined()
  })
})
