import { Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { RoleName } from 'src/core/security/role.constant'
import { StorageService as StorageInfra } from 'src/infrastructure/storage/storage.service'
import {
  AssetNotFoundException,
  DownloadForbiddenException,
  FileTooLargeException,
  UnsupportedFileTypeException
} from './errors/storage.errors'
import { SignUploadBodyType } from './schemas/storage-schemas'
import { ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES } from './storage.constant'
import { StorageRepository } from './storage.repo'

const PRIVILEGED_DOWNLOAD_ROLES: string[] = [RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN]

@Injectable()
export class StorageService {
  constructor(
    private readonly storageInfra: StorageInfra,
    private readonly storageRepository: StorageRepository
  ) {}

  async signUpload(userId: string, body: SignUploadBodyType) {
    if (!ALLOWED_CONTENT_TYPES.includes(body.contentType)) {
      throw UnsupportedFileTypeException
    }

    if (body.contentLength <= 0 || body.contentLength > MAX_UPLOAD_BYTES) {
      throw FileTooLargeException
    }

    const key = `uploads/${userId}/${randomUUID()}-${this.toSafeFileName(body.fileName)}`
    const asset = await this.storageRepository.createAsset({
      uploadedBy: userId,
      name: body.fileName,
      filePath: key,
      assetType: body.assetType ?? null
    })
    const presigned = await this.storageInfra.createPresignedUpload({
      key,
      contentType: body.contentType,
      contentLength: body.contentLength
    })

    return {
      assetId: asset.id,
      key,
      uploadUrl: presigned.uploadUrl,
      requiredHeaders: presigned.requiredHeaders,
      expiresAt: presigned.expiresAt
    }
  }

  async signDownload(user: { userId: string; roleName: string }, key: string) {
    const asset = await this.storageRepository.findAssetByKey(key)
    if (!asset) throw AssetNotFoundException

    const isOwner = asset.uploadedBy === user.userId
    // STORAGE-RBAC-SCOPE: privileged roles can view all assets in MVP because Asset has no series link yet.
    const isPrivileged = PRIVILEGED_DOWNLOAD_ROLES.includes(user.roleName)
    if (!isOwner && !isPrivileged) throw DownloadForbiddenException

    return await this.storageInfra.createPresignedDownload(key)
  }

  private toSafeFileName(fileName: string) {
    const baseName = fileName.split(/[\\/]/).pop() ?? 'file'
    const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100)
    return safeName || 'file'
  }
}
