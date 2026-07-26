import 'reflect-metadata'
import { TaskAssignService } from './task-assign.service'

describe('TaskAssignService boundary', () => {
  it('is a two-use-case compatibility facade', () => {
    expect(Reflect.getMetadata('design:paramtypes', TaskAssignService) as unknown[]).toHaveLength(2)
  })
})
