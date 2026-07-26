import {
  AiJobStatus,
  AiJobType,
  AiSegmentMode,
  RegionType,
  RoleCode,
  Specialization,
  StudioAssignmentStatus,
  TaskStatus,
  TaskVersionReviewStatus
} from '@prisma/client'
import { DEMO_ACCOUNTS, DEMO_SPECIALIZATIONS, TASK_INSTRUCTIONS } from '../demo-data'
import { DAY, pad, requiredAccount, requiredMedia } from './demo-seed.helpers'
import { DemoContext, SeriesSeed } from './demo-seed.types'

export const seedStudioAndTasks = async (context: DemoContext, hero: SeriesSeed, pageIds: string[]) => {
  const mangaka = requiredAccount(context.accounts, 'mangaka.akari')
  const assistants = DEMO_ACCOUNTS.filter((account) => account.role === RoleCode.ASSISTANT).map((account) =>
    requiredAccount(context.accounts, account.alias)
  )
  const referenceAssetIds = [
    requiredMedia(context.media, 'hokusai-sketchbook').id,
    requiredMedia(context.media, 'hokusai-sketchbook').id,
    requiredMedia(context.media, 'three-production-versions').id
  ]

  for (const [index, assistant] of assistants.entries()) {
    await context.prisma.collaborationInvite.create({
      data: {
        mangakaId: mangaka.id,
        assistantId: assistant.id,
        seriesId: hero.id,
        hireStart: new Date(context.now.getTime() - 14 * DAY),
        hireEnd: new Date(context.now.getTime() + 45 * DAY),
        taskTypes: [...DEMO_SPECIALIZATIONS[index]],
        status: 'ACCEPTED'
      }
    })
    await context.prisma.studioAssignment.create({
      data: {
        mangakaId: mangaka.id,
        assistantId: assistant.id,
        seriesId: hero.id,
        hireStart: new Date(context.now.getTime() - 14 * DAY),
        hireEnd: new Date(context.now.getTime() + 45 * DAY),
        assignedTaskTypes: [...DEMO_SPECIALIZATIONS[index]],
        status: StudioAssignmentStatus.ACTIVE
      }
    })
  }

  const specializations = Object.values(Specialization)
  for (const [index, pageId] of pageIds.entries()) {
    const primaryType = specializations[index % specializations.length]
    const secondaryType = specializations[(index + 2) % specializations.length]
    const assistant = assistants[index % assistants.length]
    const secondAssistant = assistants[(index + 1) % assistants.length]
    const manualRegion = await context.prisma.region.create({
      data: {
        pageId,
        coordinates: { x: 52, y: 112, width: 650, height: 590 },
        regionType: index % 2 === 0 ? RegionType.BACKGROUND : RegionType.PANEL,
        createdBy: 'MANUAL',
        confirmedByMangaka: true
      }
    })
    const aiRegion = await context.prisma.region.create({
      data: {
        pageId,
        coordinates: { x: 725, y: 140, width: 425, height: 395 },
        regionType: index % 3 === 0 ? RegionType.SPEECH_BUBBLE : RegionType.CHARACTER,
        detectedSubtype: index % 3 === 0 ? 'speech-bubble' : 'character',
        createdBy: 'AI',
        confirmedByMangaka: index % 2 === 0,
        confidenceScore: 0.86 + (index % 5) * 0.02,
        aiModelVersion: 'demo-manga109-yolo-v1'
      }
    })
    await context.prisma.aiJob.create({
      data: {
        type: AiJobType.SEGMENT,
        mode: index % 2 === 0 ? AiSegmentMode.MODEL : AiSegmentMode.HEURISTIC,
        pageId,
        requestedBy: mangaka.id,
        status: AiJobStatus.SUCCEEDED,
        modelVersion: index % 2 === 0 ? 'demo-manga109-yolo-v1' : 'opencv-heuristic-v1',
        proposedRegions: [
          {
            regionType: 'BACKGROUND',
            detectedSubtype: 'background',
            coordinates: { x: 52, y: 112, width: 650, height: 590 },
            confidenceScore: 0.93
          },
          {
            regionType: 'CHARACTER',
            detectedSubtype: 'character',
            coordinates: { x: 725, y: 140, width: 425, height: 395 },
            confidenceScore: 0.88
          }
        ],
        regionCount: 2,
        appliedAt: new Date(context.now.getTime() - index * 3_600_000),
        startedAt: new Date(context.now.getTime() - index * 3_600_000 - 2_200),
        finishedAt: new Date(context.now.getTime() - index * 3_600_000),
        durationMs: 2200
      }
    })

    await context.prisma.task.create({
      data: {
        pageId,
        regionIds: [manualRegion.id],
        assistantId: assistant.id,
        taskType: primaryType,
        status: TaskStatus.ASSIGNED,
        priority: 10 - index,
        deadline: new Date(context.now.getTime() + (2 + index) * DAY),
        assetIds: referenceAssetIds,
        statusReason: TASK_INSTRUCTIONS[primaryType],
        groupId: `demo-assigned-${pad(index + 1)}`,
        groupTitle: `[DEMO F3-${pad(index + 1)}] Task sẵn sàng bắt đầu`,
        versions: []
      }
    })
    const submitted = await context.prisma.task.create({
      data: {
        pageId,
        regionIds: [aiRegion.id],
        assistantId: secondAssistant.id,
        taskType: secondaryType,
        status: TaskStatus.SUBMITTED,
        priority: 5,
        deadline: new Date(context.now.getTime() + (3 + index) * DAY),
        assetIds: referenceAssetIds,
        statusReason: TASK_INSTRUCTIONS[secondaryType],
        groupId: `demo-review-${pad(index + 1)}`,
        groupTitle: `[DEMO F3-${pad(index + 1)}] Task chờ Mangaka review`,
        versions: [
          {
            submittedBy: secondAssistant.id,
            versionNumber: 1,
            file: requiredMedia(context.media, 'cleaned-lettering-page').key,
            reviewStatus: TaskVersionReviewStatus.PENDING,
            submittedAt: new Date(context.now.getTime() - 4 * 3_600_000)
          }
        ]
      }
    })
    const revision = await context.prisma.task.create({
      data: {
        pageId,
        regionIds: [manualRegion.id, aiRegion.id],
        assistantId: assistant.id,
        taskType: Specialization.LETTERING,
        status: TaskStatus.REVISION_REQUESTED,
        priority: 8,
        deadline: new Date(context.now.getTime() + (1 + index) * DAY),
        assetIds: referenceAssetIds,
        statusReason: 'Giảm kích thước font SFX, giữ thứ tự đọc RTL và chừa safe margin.',
        groupId: `demo-revision-${pad(index + 1)}`,
        groupTitle: `[DEMO F3-${pad(index + 1)}] Task cần sửa version 2`,
        versions: [
          {
            submittedBy: assistant.id,
            versionNumber: 1,
            file: requiredMedia(context.media, 'cleaned-lettering-page').key,
            reviewStatus: TaskVersionReviewStatus.REVISION_REQUESTED,
            reviewerNote: 'Bubble cuối che nét mặt nhân vật; dời lên 24 px.',
            submittedAt: new Date(context.now.getTime() - 2 * DAY)
          },
          {
            submittedBy: assistant.id,
            versionNumber: 2,
            file: requiredMedia(context.media, 'scanlated-page').key,
            reviewStatus: TaskVersionReviewStatus.REVISION_REQUESTED,
            reviewerNote: 'Đúng vị trí, cần giảm cỡ SFX thêm 10%.',
            submittedAt: new Date(context.now.getTime() - DAY)
          }
        ]
      }
    })
    await context.prisma.annotation.create({
      data: {
        taskId: submitted.id,
        authorId: mangaka.id,
        targetType: 'TASK',
        targetId: submitted.id,
        coordinates: { x: 775, y: 252, width: 300, height: 225 },
        reviewStage: 'MANGAKA',
        authorRole: 'MANGAKA',
        annotationType: 'HIGHLIGHT',
        content: 'Kiểm tra vùng này: nền cần tối hơn để tách silhouette.'
      }
    })
    await context.prisma.revisionRequest.create({
      data: {
        targetType: 'TASK',
        targetId: revision.id,
        round: 2,
        reason: 'Giảm cỡ SFX thêm 10% và giữ safe margin.',
        requestedBy: mangaka.id,
        recipientId: assistant.id
      }
    })
  }
}
