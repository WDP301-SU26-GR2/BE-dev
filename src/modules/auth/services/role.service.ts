import { Injectable } from '@nestjs/common'
import { RoleNameType } from 'src/core/security/constants/role.constant'
import { AuthRepository } from '../auth.repo'

@Injectable()
export class RoleService {
  private readonly roleIdCache = new Map<string, string>()

  // F-08 (audit 2026-07-20): data-access qua AuthRepository (repository-only rule); service chỉ giữ cache/orchestration.
  constructor(private readonly authRepository: AuthRepository) {}

  async getRoleIdByCode(code: RoleNameType): Promise<string> {
    const cached = this.roleIdCache.get(code)
    if (cached) return cached

    const roleId = await this.authRepository.findRoleIdByCode(code)
    this.roleIdCache.set(code, roleId)
    return roleId
  }
}
