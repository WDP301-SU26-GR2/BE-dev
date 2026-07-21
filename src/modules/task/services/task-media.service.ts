import { Injectable } from '@nestjs/common'
import { RoleName } from 'src/core/security/constants/role.constant'
import { StorageService } from 'src/infrastructure/storage/storage.service'
import { TaskFileForbiddenException, TaskNotFoundException } from '../errors/task.errors'
import { TaskRepository } from '../task.repo'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

// Task-scoped signed download. Generic /uploads/sign-download chỉ cho uploader HOẶC EDITOR/BOARD/ADMIN
// → Mangaka KHÔNG tải được file version của Assistant (Assistant là uploader), và Assistant KHÔNG tải
// được ảnh gốc trang (Mangaka là uploader). Đây là lỗ hổng của model cộng tác. Endpoint này đặt authz
// theo QUAN HỆ TASK (module task biết ai được xem file gì) + verify key thuộc task (chống spoof key).
@Injectable()
export class TaskMediaService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly storageService: StorageService
  ) {}

  async getDownloadUrl(user: { userId: string; roleName: string }, taskId: string, key: string) {
    if (!OBJECT_ID_RE.test(taskId)) throw TaskNotFoundException
    const ctx = await this.taskRepository.findTaskDownloadContext(taskId)
    if (!ctx?.page) throw TaskNotFoundException

    const { task, page } = ctx
    const series = page.chapter.series
    const isOwner = series.mangakaId === user.userId
    const isAssignee = task.assistantId === user.userId
    const isEditor = series.editorId === user.userId
    const isPrivileged = user.roleName === RoleName.BOARD_MEMBER || user.roleName === RoleName.SUPER_ADMIN
    if (!isOwner && !isAssignee && !isEditor && !isPrivileged) throw TaskFileForbiddenException

    // Chỉ cho ký các key THỰC SỰ thuộc task: ảnh gốc/composite của trang + mọi file version Assistant nộp
    // + ảnh reference Mangaka đính khi giao task (assetIds) — để Assistant tải được tài liệu tham khảo.
    const allowedKeys = [
      page.originalFile,
      page.compositeFile,
      ...task.versions.map((v) => v.file),
      ...ctx.assetKeys
    ].filter((k): k is string => Boolean(k))
    if (!allowedKeys.includes(key)) throw TaskFileForbiddenException

    return this.storageService.createPresignedDownload(key)
  }
}
