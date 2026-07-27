import { AnnotationTargetType, AnnotationType } from '@prisma/client'
import { AnnotationController } from './annotation.controller'

describe('AnnotationController', () => {
  const user = { userId: 'u1', roleName: 'EDITOR' }
  const body = {
    targetType: AnnotationTargetType.PAGE,
    targetId: '507f1f77bcf86cd799439011',
    annotationType: AnnotationType.TEXT,
    content: 'note'
  }

  it('forwards the authenticated user when creating an annotation', () => {
    const service = { create: jest.fn().mockReturnValue({ id: 'a1' }) }
    const controller = new AnnotationController(service as never)

    expect(controller.create(body, user as never)).toEqual({ id: 'a1' })
    expect(service.create).toHaveBeenCalledWith('u1', 'EDITOR', body)
  })

  it('forwards the authenticated user and target query when listing annotations', () => {
    const service = { list: jest.fn().mockReturnValue({ items: [] }) }
    const controller = new AnnotationController(service as never)
    const query = {
      targetType: AnnotationTargetType.REGION,
      targetId: '507f1f77bcf86cd799439012',
      limit: 20,
      offset: 0
    }

    expect(controller.list(query, user as never)).toEqual({ items: [] })
    expect(service.list).toHaveBeenCalledWith('u1', 'EDITOR', query)
  })
})
