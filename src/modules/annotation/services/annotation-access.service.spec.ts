import { AnnotationTargetType } from '@prisma/client'
import { AnnotationAccessService } from './annotation-access.service'

const ID = '507f1f77bcf86cd799439011'
const TASK_ID = '507f1f77bcf86cd799439012'
const OTHER_ID = '507f1f77bcf86cd799439013'

function makeRepo(over: Record<string, unknown> = {}) {
  return {
    findTargetContext: jest.fn().mockResolvedValue({ mangakaId: 'm1', editorId: 'e1', task: null }),
    findTaskForAnnotation: jest.fn().mockResolvedValue({ id: TASK_ID, pageId: ID, regionIds: [ID], assistantId: 'a1' }),
    findAssignedTaskIdsForTarget: jest.fn().mockResolvedValue([TASK_ID]),
    ...over
  }
}

describe('AnnotationAccessService', () => {
  it('allows the series owner to create an annotation', async () => {
    const service = new AnnotationAccessService(makeRepo() as never)
    await expect(
      service.assertCanCreate({ userId: 'm1', roleName: 'MANGAKA' }, AnnotationTargetType.PAGE, ID)
    ).resolves.toBeDefined()
  })

  it('rejects an Editor outside the target series scope', async () => {
    const service = new AnnotationAccessService(makeRepo() as never)
    await expect(
      service.assertCanCreate({ userId: 'other', roleName: 'EDITOR' }, AnnotationTargetType.PAGE, ID)
    ).rejects.toBeDefined()
  })

  it('limits an Assistant page list to annotations linked to that Assistant tasks', async () => {
    const repo = makeRepo()
    const service = new AnnotationAccessService(repo as never)
    await expect(
      service.listScope({ userId: 'a1', roleName: 'ASSISTANT' }, AnnotationTargetType.PAGE, ID)
    ).resolves.toEqual({
      taskIds: [TASK_ID]
    })
    expect(repo.findAssignedTaskIdsForTarget).toHaveBeenCalledWith('a1', AnnotationTargetType.PAGE, ID)
  })

  it('allows an Assistant to read annotations on exactly their Task target', async () => {
    const repo = makeRepo({
      findTargetContext: jest.fn().mockResolvedValue({
        mangakaId: 'm1',
        editorId: 'e1',
        task: { id: TASK_ID, pageId: ID, regionIds: [ID], assistantId: 'a1' }
      })
    })
    const service = new AnnotationAccessService(repo as never)
    await expect(
      service.listScope({ userId: 'a1', roleName: 'ASSISTANT' }, AnnotationTargetType.TASK, TASK_ID)
    ).resolves.toEqual({
      taskIds: null
    })
  })

  it('requires taskId to belong to the annotated target', async () => {
    const service = new AnnotationAccessService(makeRepo() as never)
    await expect(service.assertTaskBinding(AnnotationTargetType.PAGE, ID, TASK_ID)).resolves.toBeUndefined()
    await expect(service.assertTaskBinding(AnnotationTargetType.PAGE, OTHER_ID, TASK_ID)).rejects.toBeDefined()
    await expect(service.assertTaskBinding(AnnotationTargetType.MANUSCRIPT, ID, TASK_ID)).rejects.toBeDefined()
  })
})
