import { Injectable } from '@nestjs/common'
import { StoryboardStatus } from '@prisma/client'
import { toStoryboardRes } from '../storyboard.mapper'
import { StoryboardRepo } from '../storyboard.repo'

// Spec 28: Storyboard giờ chỉ phục vụ phác thảo CHƯƠNG — không còn khái niệm "Storyboard của proposal".
@Injectable()
export class StoryboardApprovalService {
  constructor(private readonly repository: StoryboardRepo) {}

  async findApprovalById(storyboardId: string) {
    const storyboard = await this.repository.findStoryboardById(storyboardId)
    return storyboard ? { status: storyboard.status } : null
  }

  async submitChapterStoryboard(storyboardId: string) {
    const storyboard = await this.repository.updateStoryboardStatus(storyboardId, {
      status: StoryboardStatus.SUBMITTED,
      submittedAt: new Date()
    })
    return toStoryboardRes(storyboard)
  }
}
