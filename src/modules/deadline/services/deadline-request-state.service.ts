import { Injectable } from '@nestjs/common'
import { DeadlineRequestStatus, Prisma } from '@prisma/client'
import { DEADLINE_REQUEST_TRANSITIONS } from '../deadline.constant'
import { DeadlineRepository } from '../deadline.repo'
import { DeadlineRequestNotFoundException, InvalidDeadlineRequestTransitionException } from '../errors/deadline.errors'

@Injectable()
export class DeadlineRequestStateService {
  constructor(private readonly deadlineRepository: DeadlineRepository) {}

  async transition(
    id: string,
    to: DeadlineRequestStatus,
    opts: { by: string; reason?: string | null; extra?: Prisma.DeadlineRequestUpdateInput }
  ) {
    const deadlineRequest = await this.deadlineRepository.findById(id)
    if (!deadlineRequest) throw DeadlineRequestNotFoundException
    const from = deadlineRequest.status
    const allowed = DEADLINE_REQUEST_TRANSITIONS[from] ?? []
    if (!allowed.includes(to)) throw InvalidDeadlineRequestTransitionException
    return this.deadlineRepository.applyTransition(id, {
      from,
      to,
      by: opts.by,
      reason: opts.reason,
      extra: opts.extra
    })
  }
}
