import { Injectable } from '@nestjs/common'
import { RoleName, RoleNameType } from 'src/core/security/constants/role.constant'
import { ScheduleService } from 'src/modules/chapter/services/schedule.service'
import { resolveSide } from '../deadline.constant'
import { toDeadlineRequestRes } from '../deadline.mapper'
import { DeadlineRepository } from '../deadline.repo'
import { DeadlineRequestAccessDeniedException, DeadlineRequestNotFoundException } from '../errors/deadline.errors'
import { ListDeadlineRequestQueryType } from '../schemas/deadline-schemas'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/
const ALL_SCOPE: RoleNameType[] = [RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN]

@Injectable()
export class DeadlineQueryService {
  constructor(
    private readonly scheduleService: ScheduleService,
    private readonly deadlineRepository: DeadlineRepository
  ) {}

  private async assertCanAccessChapter(userId: string, roleName: string, chapterId: string) {
    if (!OBJECT_ID_RE.test(chapterId)) throw DeadlineRequestNotFoundException
    const ctx = await this.scheduleService.getDeadlineContext(chapterId)
    if (!ctx) throw DeadlineRequestNotFoundException
    if (ALL_SCOPE.includes(roleName as RoleNameType)) return ctx
    if (!resolveSide(userId, ctx.series)) throw DeadlineRequestAccessDeniedException
    return ctx
  }

  async list(userId: string, roleName: string, query: ListDeadlineRequestQueryType) {
    await this.assertCanAccessChapter(userId, roleName, query.chapterId)
    const items = await this.deadlineRepository.listByChapter(query.chapterId, query.status)
    return { items: items.map(toDeadlineRequestRes) }
  }

  async getOne(userId: string, roleName: string, id: string) {
    if (!OBJECT_ID_RE.test(id)) throw DeadlineRequestNotFoundException
    const request = await this.deadlineRepository.findById(id)
    if (!request || !request.chapterId) throw DeadlineRequestNotFoundException
    await this.assertCanAccessChapter(userId, roleName, request.chapterId)
    return toDeadlineRequestRes(request)
  }
}
