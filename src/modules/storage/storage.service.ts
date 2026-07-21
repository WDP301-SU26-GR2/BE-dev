import { Injectable } from '@nestjs/common'
import { AssetType } from '@prisma/client'
import { randomUUID } from 'crypto'
import { RoleName } from 'src/core/security/constants/role.constant'
import { StorageService as StorageInfra } from 'src/infrastructure/storage/storage.service'
import { AppConfigService } from 'src/modules/app-config/app-config.service'
import {
  AssetNotFoundException,
  DownloadForbiddenException,
  FileTooLargeException,
  UnsupportedFileTypeException
} from './errors/storage.errors'
import { SignUploadBodyType } from './schemas/storage-schemas'
import { ALLOWED_CONTENT_TYPES } from './storage.constant'
import { StorageRepository } from './storage.repo'

const PRIVILEGED_DOWNLOAD_ROLES: string[] = [RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN]

@Injectable()
export class StorageService {
  constructor(
    private readonly storageInfra: StorageInfra,
    private readonly storageRepository: StorageRepository,
    private readonly appConfigService: AppConfigService
  ) {}

  async signUpload(userId: string, body: SignUploadBodyType) {
    if (!ALLOWED_CONTENT_TYPES.includes(body.contentType)) {
      throw UnsupportedFileTypeException
    }

    const config = await this.appConfigService.get()
    if (body.contentLength <= 0 || body.contentLength > config.maxUploadBytes) {
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

    // STORAGE-RBAC-SCOPE: chỉ gác quyền tải cho DOCUMENT (hợp đồng...) — thứ thực sự nhạy cảm
    // và đã có route riêng RBAC (GET /contracts/:id/pdf). Ảnh hiển thị chung (avatar/cover/portfolio/
    // page/task file) cho mọi user đã đăng nhập tải nếu có object key: bucket private + key random
    // + URL hết hạn ngắn, và key chỉ lộ qua các endpoint đã scope. Trước đây owner-only chặn cả
    // Mangaka xem avatar Assistant trong danh bạ (key trả về là object key thô).
    if (asset.assetType === AssetType.DOCUMENT) {
      const isOwner = asset.uploadedBy === user.userId
      const isPrivileged = PRIVILEGED_DOWNLOAD_ROLES.includes(user.roleName)
      if (!isOwner && !isPrivileged) throw DownloadForbiddenException
    }

    return await this.storageInfra.createPresignedDownload(key)
  }

  private toSafeFileName(fileName: string) {
    const baseName = fileName.split(/[\\/]/).pop() ?? 'file'
    const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100)
    return safeName || 'file'
  }
}
