import { Injectable } from '@nestjs/common'
import { RoleName } from 'src/core/security/constants/role.constant'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { ContractRepo } from '../contract.repo'
import { ContractErrors } from '../errors/contract.errors'

@Injectable()
export class ContractQueryService {
  constructor(private readonly contractRepo: ContractRepo) {}

  healthCheck() {
    return { status: 'OK', module: 'Contract' }
  }

  getContracts(userId: string, roleName: string) {
    return this.contractRepo.findManyByViewer(userId, roleName)
  }

  async getContractById(contractId: string, userId: string, roleName: string) {
    const contract = await this.loadViewable(contractId, userId, roleName)
    return contract
  }

  async getContractVersions(contractId: string, userId: string, roleName: string) {
    await this.loadViewable(contractId, userId, roleName)
    return this.contractRepo.findVersionsByContractId(contractId)
  }

  async getContractVersionById(contractId: string, versionId: string, userId: string, roleName: string) {
    if (!isObjectId(versionId)) throw ContractErrors.NotFound()
    await this.loadViewable(contractId, userId, roleName)
    const version = await this.contractRepo.findVersionById(contractId, versionId)
    if (!version) throw ContractErrors.NotFound()
    return version
  }

  assertCanView(contract: { editorId: string | null; mangakaId: string }, userId: string, roleName: string) {
    if (roleName === RoleName.BOARD_MEMBER) return
    if (roleName === RoleName.EDITOR && contract.editorId === userId) return
    if (roleName === RoleName.MANGAKA && contract.mangakaId === userId) return
    throw ContractErrors.ContractAccessDenied()
  }

  private async loadViewable(contractId: string, userId: string, roleName: string) {
    if (!isObjectId(contractId)) throw ContractErrors.NotFound()
    const contract = await this.contractRepo.findById(contractId)
    if (!contract) throw ContractErrors.NotFound()
    this.assertCanView(contract, userId, roleName)
    return contract
  }
}
