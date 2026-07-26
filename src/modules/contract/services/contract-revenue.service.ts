import { Injectable } from '@nestjs/common'
import { AuditEntityType } from '@prisma/client'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { DomainEvent } from 'src/core/events/domain-events'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { RoleName } from 'src/core/security/constants/role.constant'
import { AuditService } from 'src/modules/audit/audit.service'
import { ContractMessages } from '../contract.messages'
import { ContractRepo } from '../contract.repo'
import { ReportRevenueBodyDto } from '../dto/contract.dto'
import { ContractErrors } from '../errors/contract.errors'

@Injectable()
export class ContractRevenueService {
  constructor(
    private readonly contractRepo: ContractRepo,
    private readonly domainEventBus: DomainEventBus,
    private readonly auditService: AuditService
  ) {}

  async reportRevenue(contractId: string, userId: string, roleName: string, body: ReportRevenueBodyDto) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    if (contract.contractType !== 'REVENUE_SHARE' || contract.status !== 'FULLY_EXECUTED') {
      throw ContractErrors.RevenueNotApplicable()
    }
    if (roleName === RoleName.EDITOR && contract.editorId !== userId) {
      throw ContractErrors.UnauthorizedEditor()
    }
    this.domainEventBus.emit(DomainEvent.RevenueReported, {
      contractId,
      revenue: body.revenue,
      period: body.period
    })
    await this.auditService.record({
      actorId: userId,
      entityType: AuditEntityType.CONTRACT,
      entityId: contractId,
      action: 'REVENUE_REPORTED',
      reason: `revenue=${body.revenue} period=${body.period}`
    })
    return { message: ContractMessages.response.revenueRecorded }
  }
}
