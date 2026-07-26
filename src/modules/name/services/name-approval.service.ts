import { Injectable } from '@nestjs/common'
import { NameStatus } from '@prisma/client'
import { NameApprovalQueryPort } from 'src/modules/series/ports/name-approval-query.port'
import { toNameRes } from '../name.mapper'
import { NameRepo } from '../name.repo'

@Injectable()
export class NameApprovalService implements NameApprovalQueryPort {
  constructor(private readonly repository: NameRepo) {}

  async findApprovalById(nameId: string) {
    const name = await this.repository.findNameById(nameId)
    return name ? { status: name.status } : null
  }

  async submitProposalName(nameId: string) {
    const name = await this.repository.updateNameStatus(nameId, {
      status: NameStatus.SUBMITTED,
      submittedAt: new Date()
    })
    return toNameRes(name)
  }

  async resetProposalNameToDraft(nameId: string) {
    await this.repository.updateNameStatus(nameId, { status: NameStatus.DRAFT })
  }
}
