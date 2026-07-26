import { RoleNameType } from 'src/core/security/constants/role.constant'
import { ReprintRequestRepo } from '../reprint-request.repo'
import { ActorContext } from './reprint-access.policy'

export const toReprintActor = (value: ActorContext | string, defaultRole: RoleNameType): ActorContext =>
  typeof value === 'string' ? { userId: value, roleName: defaultRole } : value

export const loadReprintAccessContext = async (
  repository: ReprintRequestRepo,
  seriesId: string,
  fallbackEditorId: string | null,
  fallbackOwnerMangakaId?: string
): Promise<{ editorId: string | null; ownerMangakaIds: string[] }> => {
  const compatibleRepository = repository as ReprintRequestRepo & {
    findAccessContext?: (id: string) => Promise<{ editorId: string | null; ownerMangakaIds: string[] }>
  }
  if (typeof compatibleRepository.findAccessContext === 'function') {
    return compatibleRepository.findAccessContext(seriesId)
  }
  const contract =
    typeof compatibleRepository.findActiveContractBySeriesId === 'function'
      ? await compatibleRepository.findActiveContractBySeriesId(seriesId)
      : null
  return {
    editorId: fallbackEditorId,
    ownerMangakaIds: contract?.mangakaId ? [contract.mangakaId] : fallbackOwnerMangakaId ? [fallbackOwnerMangakaId] : []
  }
}
