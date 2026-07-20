import { TaskRepository } from './task.repo'
import { toTaskRes } from './task.mapper'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

describe('TaskRepository response enrichment', () => {
  it('uses one user lookup for a page and enriches embedded TaskVersion submitters', async () => {
    const createdAt = new Date('2026-07-18T00:00:00.000Z')
    const tasks = Array.from({ length: 20 }, (_, index) => ({
      id: `t${index}`,
      pageId: 'p1',
      regionId: null,
      assistantId: 'assistant',
      taskType: 'CLEANER',
      status: 'ASSIGNED',
      statusReason: null,
      priority: 0,
      deadline: null,
      assetIds: [],
      versions: [
        {
          submittedBy: 'submitter',
          versionNumber: 1,
          file: 'file',
          reviewStatus: 'PENDING',
          reviewerNote: null,
          submittedAt: createdAt
        }
      ],
      createdAt
    }))
    const prisma = {
      task: { findMany: jest.fn().mockResolvedValue(tasks) },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'assistant', name: 'Assistant', displayName: null, avatar: null },
          { id: 'submitter', name: 'Submitter', displayName: 'Version owner', avatar: null }
        ])
      },
      series: { findMany: jest.fn() }
    }

    const result = await new TaskRepository(prisma as unknown as PrismaService).listTasks({}, { limit: 20, offset: 0 })
    const response = toTaskRes(result[0])

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.user.findMany.mock.calls[0][0].where.id.in).toEqual(['assistant', 'submitter'])
    expect(response.assistant?.displayName).toBe('Assistant')
    expect(response.versions[0].submitter?.displayName).toBe('Version owner')
  })

  // Gap: Assistant nhận task theo Region nhưng TaskRes chỉ có regionId trần,
  // và GET /pages/:id/regions là MANGAKA/EDITOR-only → không có đường lấy toạ độ.
  it('embeds region coordinates so an assistant can locate the area to work on', async () => {
    const createdAt = new Date('2026-07-20T00:00:00.000Z')
    const task = {
      id: 't1',
      pageId: 'p1',
      regionId: 'r1',
      assistantId: 'assistant',
      taskType: 'BACKGROUND',
      status: 'ASSIGNED',
      statusReason: null,
      priority: 0,
      deadline: null,
      assetIds: [],
      versions: [],
      createdAt
    }
    const prisma = {
      task: { findUnique: jest.fn().mockResolvedValue(task) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      region: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'r1',
            pageId: 'p1',
            coordinates: { x: 120, y: 340, width: 400, height: 260 },
            regionType: 'BACKGROUND',
            createdBy: 'MANUAL',
            confirmedByMangaka: true,
            confidenceScore: null,
            detectedSubtype: null,
            aiModelVersion: null
          }
        ])
      },
      series: { findMany: jest.fn() }
    }

    const row = await new TaskRepository(prisma as unknown as PrismaService).findTaskById('t1')
    const response = toTaskRes(row!)

    expect(response.region).toEqual({
      id: 'r1',
      pageId: 'p1',
      coordinates: { x: 120, y: 340, width: 400, height: 260 },
      regionType: 'BACKGROUND',
      createdBy: 'MANUAL',
      confirmedByMangaka: true,
      confidenceScore: null,
      detectedSubtype: null,
      aiModelVersion: null
    })
  })

  it('resolves regions in one batched query and yields null for tasks without a region', async () => {
    const createdAt = new Date('2026-07-20T00:00:00.000Z')
    const tasks = Array.from({ length: 20 }, (_, index) => ({
      id: `t${index}`,
      pageId: 'p1',
      // xen kẽ: task theo vùng và task không gắn vùng
      regionId: index % 2 === 0 ? `r${index}` : null,
      assistantId: 'assistant',
      taskType: 'SCREENTONE',
      status: 'ASSIGNED',
      statusReason: null,
      priority: 0,
      deadline: null,
      assetIds: [],
      versions: [],
      createdAt
    }))
    const prisma = {
      task: { findMany: jest.fn().mockResolvedValue(tasks) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      region: {
        findMany: jest.fn().mockResolvedValue(
          tasks
            .filter((t) => t.regionId)
            .map((t) => ({
              id: t.regionId,
              pageId: 'p1',
              coordinates: { x: 1, y: 2, width: 3, height: 4 },
              regionType: 'SCREENTONE',
              createdBy: 'MANUAL',
              confirmedByMangaka: false,
              confidenceScore: null,
              detectedSubtype: null,
              aiModelVersion: null
            }))
        )
      },
      series: { findMany: jest.fn() }
    }

    const rows = await new TaskRepository(prisma as unknown as PrismaService).listTasks({}, { limit: 20, offset: 0 })
    const responses = rows.map(toTaskRes)

    expect(prisma.region.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.region.findMany.mock.calls[0][0].where.id.in).toEqual([
      'r0',
      'r2',
      'r4',
      'r6',
      'r8',
      'r10',
      'r12',
      'r14',
      'r16',
      'r18'
    ])
    expect(responses[0].region?.coordinates).toEqual({ x: 1, y: 2, width: 3, height: 4 })
    expect(responses[1].region).toBeNull()
  })
})
