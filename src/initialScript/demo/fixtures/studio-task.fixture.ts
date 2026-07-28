import {
  AiJobStatus,
  AiJobType,
  AiSegmentMode,
  AiSegmentSource,
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

export const seedStudioAssignments = async (context: DemoContext, hero: SeriesSeed) => {
  const mangaka = requiredAccount(context.accounts, 'mangaka.akari')
  const assistants = DEMO_ACCOUNTS.filter((account) => account.role === RoleCode.ASSISTANT).map((account) =>
    requiredAccount(context.accounts, account.alias)
  )
  await Promise.all(
    assistants.flatMap((assistant, index) => [
      context.prisma.collaborationInvite.create({
        data: {
          mangakaId: mangaka.id,
          assistantId: assistant.id,
          seriesId: hero.id,
          hireStart: new Date(context.now.getTime() - 14 * DAY),
          hireEnd: new Date(context.now.getTime() + 45 * DAY),
          taskTypes: [...DEMO_SPECIALIZATIONS[index]],
          status: 'ACCEPTED'
        }
      }),
      context.prisma.studioAssignment.create({
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
    ])
  )
}

export const seedTasksForInkingRun = async (
  context: DemoContext,
  runIndex: number,
  stageId: string,
  pages: readonly { id: string; originalFile: string | null }[]
) => {
  const mangaka = requiredAccount(context.accounts, 'mangaka.akari')
  const yuki = requiredAccount(context.accounts, 'assistant.yuki')
  const kei = requiredAccount(context.accounts, 'assistant.kei')
  const referenceAssetIds = [
    requiredMedia(context.media, 'hokusai-sketchbook').id,
    requiredMedia(context.media, 'three-production-versions').id,
    requiredMedia(context.media, 'manga-page-cc0').id
  ]
  const taskStatuses = [TaskStatus.ASSIGNED, TaskStatus.SUBMITTED, TaskStatus.REVISION_REQUESTED]

  for (const [pageIndex, page] of pages.entries()) {
    if (!page.originalFile) throw new Error(`Missing stage input for page ${page.id}`)
    const assistant = pageIndex === 1 ? kei : yuki
    const region = await context.prisma.region.create({
      data: {
        pageId: page.id,
        coordinates:
          pageIndex === 0 ? { x: 54, y: 96, width: 620, height: 690 } : { x: 610, y: 125, width: 390, height: 560 },
        regionType: pageIndex === 0 ? RegionType.PANEL : RegionType.CHARACTER,
        createdBy: 'MANUAL',
        confirmedByMangaka: true
      }
    })
    const status = taskStatuses[pageIndex]
    const versions =
      status === TaskStatus.ASSIGNED
        ? []
        : [
            {
              submittedBy: assistant.id,
              versionNumber: 1,
              file: requiredMedia(context.media, 'finished-line-art').key,
              reviewStatus:
                status === TaskStatus.REVISION_REQUESTED
                  ? TaskVersionReviewStatus.REVISION_REQUESTED
                  : TaskVersionReviewStatus.PENDING,
              reviewerNote:
                status === TaskStatus.REVISION_REQUESTED
                  ? 'Nét viền nhân vật cần dày hơn nền, giữ sạch vùng bubble.'
                  : null,
              submittedAt: new Date(context.now.getTime() - (5 - pageIndex) * 3_600_000)
            }
          ]
    const task = await context.prisma.task.create({
      data: {
        pageId: page.id,
        regionIds: [region.id],
        assistantId: assistant.id,
        taskType: Specialization.INKING,
        status,
        priority: 10 - pageIndex,
        deadline: new Date(context.now.getTime() + (2 + runIndex) * DAY),
        assetIds: referenceAssetIds,
        statusReason: status === TaskStatus.REVISION_REQUESTED ? 'Mangaka đã yêu cầu chỉnh nét lần 1.' : null,
        groupId: `demo-f3-${pad(runIndex + 1)}`,
        groupTitle: `[DEMO F3-${pad(runIndex + 1)}] INKING batch`,
        stageId,
        startedAt: status === TaskStatus.ASSIGNED ? null : new Date(context.now.getTime() - 8 * 3_600_000),
        description: `${TASK_INSTRUCTIONS.INKING} Trang ${pageIndex + 1}: chỉ xử lý region đã confirm.`,
        versions
      }
    })

    if (status === TaskStatus.REVISION_REQUESTED) {
      await context.prisma.annotation.create({
        data: {
          taskId: task.id,
          authorId: mangaka.id,
          targetType: 'PAGE',
          targetId: page.id,
          coordinates: { x: 650, y: 252, width: 270, height: 310 },
          reviewStage: 'MANGAKA',
          authorRole: 'MANGAKA',
          annotationType: 'HIGHLIGHT',
          content: 'Nét silhouette ở vùng này bị đều; tăng line weight phía tiền cảnh.'
        }
      })
      await context.prisma.revisionRequest.create({
        data: {
          targetType: 'TASK',
          targetId: task.id,
          round: 1,
          reason: 'Tăng line weight silhouette tiền cảnh và giữ vùng thoại sạch.',
          requestedBy: mangaka.id,
          recipientId: assistant.id
        }
      })
    }
  }

  const aiPage = pages[0]
  if (!aiPage?.originalFile) throw new Error(`Missing AI input for run ${runIndex + 1}`)
  await context.prisma.aiJob.create({
    data: {
      type: AiJobType.SEGMENT,
      mode: runIndex % 2 === 0 ? AiSegmentMode.MODEL : AiSegmentMode.HEURISTIC,
      pageId: aiPage.id,
      requestedBy: mangaka.id,
      status: AiJobStatus.SUCCEEDED,
      modelVersion: runIndex % 2 === 0 ? 'manga109-yolov8n-seg-pilot' : 'opencv-heuristic-v1',
      proposedRegions: [
        {
          regionType: 'PANEL',
          detectedSubtype: 'panel',
          coordinates: { x: 45, y: 82, width: 642, height: 704 },
          confidenceScore: 0.93
        },
        {
          regionType: 'CHARACTER',
          detectedSubtype: 'character',
          coordinates: { x: 610, y: 125, width: 390, height: 560 },
          confidenceScore: 0.88
        }
      ],
      regionCount: 2,
      appliedAt: null,
      startedAt: new Date(context.now.getTime() - runIndex * 3_600_000 - 2_200),
      finishedAt: new Date(context.now.getTime() - runIndex * 3_600_000),
      durationMs: 2200,
      sourceType: AiSegmentSource.ORIGINAL,
      sourceFileKey: aiPage.originalFile,
      sourceRevision: 1,
      sourceStageId: stageId,
      sourceWidth: 1080,
      sourceHeight: 1440
    }
  })
}
