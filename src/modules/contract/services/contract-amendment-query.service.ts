import { Injectable } from '@nestjs/common'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ContractAmendmentRepo } from '../contract-amendment.repo'
import { ContractRepo } from '../contract.repo'
import { ContractErrors } from '../errors/contract.errors'

@Injectable()
export class ContractAmendmentQueryService {
  constructor(
    private readonly amendmentRepo: ContractAmendmentRepo,
    private readonly contractRepo: ContractRepo
  ) {}

  async list(contractId: string, userId: string, roleName: string) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    this.assertCanView(contract, userId, roleName)
    return this.amendmentRepo.findManyByContract(contractId)
  }

  async detail(contractId: string, id: string, userId: string, roleName: string) {
    if (!isObjectId(contractId) || !isObjectId(id)) throw ContractErrors.AmendmentNotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    this.assertCanView(contract, userId, roleName)
    const amendment = await this.amendmentRepo.findById(id)
    if (!amendment || amendment.contractId !== contractId) throw ContractErrors.AmendmentNotFound()
    return amendment
  }

  private assertCanView(contract: { editorId: string | null; mangakaId: string }, userId: string, roleName: string) {
    if (roleName === RoleName.BOARD_MEMBER) return
    if (roleName === RoleName.EDITOR && contract.editorId === userId) return
    if (roleName === RoleName.MANGAKA && contract.mangakaId === userId) return
    throw ContractErrors.ContractAccessDenied()
  }
}
