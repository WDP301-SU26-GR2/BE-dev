import { TaskRepository } from './task.repo'
import { toTaskRes } from './task.mapper'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

describe('TaskRepository response enrichment', () => {
  it('uses one user lookup for a page and enriches embedded TaskVersion submitters', async () => {
    const createdAt = new Date('2026-07-18T00:00:00.000Z')
    const tasks = Array.from({ length: 20 }, (_, index) => ({
      id: `t${index}`,
      pageId: 'p1',
      regionIds: [],
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
      page: { findMany: jest.fn().mockResolvedValue([]) },
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
      regionIds: ['r1'],
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
      page: { findMany: jest.fn().mockResolvedValue([]) },
      series: { findMany: jest.fn() }
    }

    const row = await new TaskRepository(prisma as unknown as PrismaService).findTaskById('t1')
    const response = toTaskRes(row!)

    expect(response.regions).toEqual([
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
  })

  // Màn review Mangaka cần 2 ảnh: bản gốc trang (Mangaka giao) + bản Assistant nộp (versions[].file).
  // TaskRes trước chỉ có versions → embed thêm key ảnh gốc trang để lấy đủ 2 ảnh trong 1 response.
  it('embeds the page base image keys (pageOriginalFile + pageDisplayFile = composite ?? original)', async () => {
    const createdAt = new Date('2026-07-21T00:00:00.000Z')
    const task = {
      id: 't1',
      pageId: 'p1',
      regionIds: [],
      assistantId: 'assistant',
      taskType: 'BACKGROUND',
      status: 'SUBMITTED',
      statusReason: null,
      priority: 0,
      deadline: null,
      assetIds: [],
      versions: [
        {
          submittedBy: 'assistant',
          versionNumber: 1,
          file: 'r2://assistant-result.png',
          reviewStatus: 'PENDING',
          reviewerNote: null,
          submittedAt: createdAt
        }
      ],
      createdAt
    }
    const prisma = {
      task: { findUnique: jest.fn().mockResolvedValue(task) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      region: { findMany: jest.fn().mockResolvedValue([]) },
      page: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'p1', originalFile: 'r2://page-original.png', compositeFile: 'r2://page-composite.png' }
          ])
      },
      series: { findMany: jest.fn() }
    }

    const row = await new TaskRepository(prisma as unknown as PrismaService).findTaskById('t1')
    const response = toTaskRes(row!)

    expect(prisma.page.findMany).toHaveBeenCalledTimes(1)
    expect(response.pageOriginalFile).toBe('r2://page-original.png')
    // displayFile = composite ?? original → có composite thì trỏ composite
    expect(response.pageDisplayFile).toBe('r2://page-composite.png')
    expect(response.versions[0].file).toBe('r2://assistant-result.png')
  })

  it('pageDisplayFile falls back to originalFile when the page has no composite yet', async () => {
    const createdAt = new Date('2026-07-21T00:00:00.000Z')
    const task = {
      id: 't1',
      pageId: 'p1',
      regionIds: [],
      assistantId: 'a',
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
      region: { findMany: jest.fn().mockResolvedValue([]) },
      page: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'p1', originalFile: 'r2://only-original.png', compositeFile: null }])
      },
      series: { findMany: jest.fn() }
    }

    const row = await new TaskRepository(prisma as unknown as PrismaService).findTaskById('t1')
    const response = toTaskRes(row!)

    expect(response.pageOriginalFile).toBe('r2://only-original.png')
    expect(response.pageDisplayFile).toBe('r2://only-original.png')
  })

  it('resolves regions in one batched query and yields [] for tasks without a region', async () => {
    const createdAt = new Date('2026-07-20T00:00:00.000Z')
    const tasks = Array.from({ length: 20 }, (_, index) => ({
      id: `t${index}`,
      pageId: 'p1',
      // xen kẽ: task theo vùng và task không gắn vùng
      regionIds: index % 2 === 0 ? [`r${index}`] : [],
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
            .flatMap((t) => t.regionIds)
            .map((id) => ({
              id,
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
      page: { findMany: jest.fn().mockResolvedValue([]) },
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
    expect(responses[0].regions?.[0]?.coordinates).toEqual({ x: 1, y: 2, width: 3, height: 4 })
    expect(responses[1].regions).toEqual([])
  })
})
