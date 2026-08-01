import { SeriesStatus } from '@prisma/client'
import { SeriesStateService } from './series-state.service'
import { asCacheService, makeCacheServiceMock } from 'src/infrastructure/redis/cache.service.mock'
import { MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { SeriesModule } from '../series.module'
import { SeriesController } from '../series.controller'
import { SeriesResDto } from '../dto/series.dto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    findById: jest.fn(),
    updateStatusWithHistory: jest
      .fn()
      .mockImplementation((id, entry) => Promise.resolve({ id, status: entry.toStatus })),
    ...overrides
  }
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) }
}

describe('SeriesStateService.transition', () => {
  it('allows a valid transition and records history', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue({ id: 's1', status: SeriesStatus.DRAFT }) })
    const audit = makeAudit()
    const svc = new SeriesStateService(repo as never, audit as never, asCacheService(makeCacheServiceMock()))
    const res = await svc.transition('s1', SeriesStatus.IN_REVIEW, { changedBy: 'u1', reason: 'ready' })
    expect(repo.updateStatusWithHistory).toHaveBeenCalledWith('s1', {
      fromStatus: SeriesStatus.DRAFT,
      toStatus: SeriesStatus.IN_REVIEW,
      changedBy: 'u1',
      reason: 'ready'
    })
    expect(audit.record).toHaveBeenCalledWith({
      actorId: 'u1',
      entityType: 'SERIES',
      entityId: 's1',
      action: 'TRANSITION',
      fromState: SeriesStatus.DRAFT,
      toState: SeriesStatus.IN_REVIEW,
      reason: 'ready'
    })
    expect(res).toMatchObject({ status: SeriesStatus.IN_REVIEW })
  })

  it('rejects an invalid transition with 409', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue({ id: 's1', status: SeriesStatus.DRAFT }) })
    const svc = new SeriesStateService(repo as never, makeAudit() as never, asCacheService(makeCacheServiceMock()))
    await expect(svc.transition('s1', SeriesStatus.PITCHED, { changedBy: 'u1' })).rejects.toBeDefined()
    expect(repo.updateStatusWithHistory).not.toHaveBeenCalled()
  })

  it('throws when series not found', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) })
    const svc = new SeriesStateService(repo as never, makeAudit() as never, asCacheService(makeCacheServiceMock()))
    await expect(svc.transition('sX', SeriesStatus.IN_REVIEW, { changedBy: 'u1' })).rejects.toBeDefined()
  })

  it('Spec 22: allows every reopen/rework edge and still rejects PITCHED → DRAFT', async () => {
    const allowed: Array<[SeriesStatus, SeriesStatus]> = [
      [SeriesStatus.REJECTED, SeriesStatus.IN_REVIEW],
      [SeriesStatus.REJECTED, SeriesStatus.WITHDRAWN],
      [SeriesStatus.REJECTED, SeriesStatus.ABANDONED],
      [SeriesStatus.ABANDONED, SeriesStatus.DRAFT],
      [SeriesStatus.WITHDRAWN, SeriesStatus.DRAFT]
    ]

    for (const [fromStatus, toStatus] of allowed) {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue({ id: 's1', status: fromStatus }) })
      const svc = new SeriesStateService(repo as never, makeAudit() as never, asCacheService(makeCacheServiceMock()))

      await expect(svc.transition('s1', toStatus, { changedBy: 'u1' })).resolves.toMatchObject({ status: toStatus })
      expect(repo.updateStatusWithHistory).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ fromStatus, toStatus, changedBy: 'u1' })
      )
    }

    const repo = makeRepo({ findById: jest.fn().mockResolvedValue({ id: 's1', status: SeriesStatus.PITCHED }) })
    const svc = new SeriesStateService(repo as never, makeAudit() as never, asCacheService(makeCacheServiceMock()))
    await expect(svc.transition('s1', SeriesStatus.DRAFT, { changedBy: 'u1' })).rejects.toBeDefined()
    expect(repo.updateStatusWithHistory).not.toHaveBeenCalled()
  })
})

describe('Spec 28 — bỏ điều kiện thứ hai', () => {
  it('SeriesStateService KHÔNG còn method tryAdvanceToReadyToPitch', () => {
    expect(
      (SeriesStateService.prototype as unknown as Record<string, unknown>).tryAdvanceToReadyToPitch
    ).toBeUndefined()
  })

  it('constructor chỉ nhận 3 dependency (bỏ NameApprovalQueryPort)', () => {
    expect(SeriesStateService.length).toBe(3)
  })

  it('SeriesModule không còn import StoryboardModule sau khi bỏ approval query wiring', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, SeriesModule) as Array<{ name?: string }>
    expect(imports.map((item) => item.name)).not.toContain('StoryboardModule')
  })

  it('SeriesController exposes zero /series/:id/names lifecycle routes', () => {
    const controllerPrototype = SeriesController.prototype as unknown as Record<string, object>
    const routePaths = Object.getOwnPropertyNames(SeriesController.prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => Reflect.getMetadata(PATH_METADATA, controllerPrototype[name]) as unknown)
      .filter((path): path is string => typeof path === 'string')
    expect(routePaths.filter((path) => path.includes('names'))).toEqual([])
  })

  it('submit route serializes the direct result with SeriesResDto', () => {
    const handler = (SeriesController.prototype as unknown as Record<string, object>).submit
    const metadataKeys = Reflect.getMetadataKeys(handler) as Array<string | symbol>
    const metadataValues = metadataKeys.map((key) => Reflect.getMetadata(key, handler) as unknown)
    expect(metadataValues).toContain(SeriesResDto)
  })

  it('proposal approve Swagger summary promises immediate READY_TO_PITCH without a second entity gate', () => {
    const handler = (SeriesController.prototype as unknown as Record<string, object>).approveProposal
    const metadataKeys = Reflect.getMetadataKeys(handler) as Array<string | symbol>
    const operation = metadataKeys
      .map((key) => Reflect.getMetadata(key, handler) as unknown)
      .find(
        (value): value is { summary: string } =>
          typeof value === 'object' && value !== null && typeof (value as { summary?: unknown }).summary === 'string'
      )
    expect(operation?.summary).toContain('READY_TO_PITCH ngay')
    expect(operation?.summary).not.toMatch(/\bName\b/)
  })

  it('expanded Spec 28 files contain no legacy Name entity wording', () => {
    const repoRoot = join(__dirname, '../../../../')
    const files = [
      'src/modules/series/series.controller.ts',
      'src/modules/chapter/chapter.controller.ts',
      'src/modules/chapter/schemas/chapter-schemas.ts',
      'src/core/http/docs/enum-docs.ts',
      'src/initialScript/DEMO-SEED-GUIDE.md',
      'ARCHITECTURE.md',
      'test/flows/flow-01-serialization.ts',
      'test/flows/AUTHORITATIVE.md',
      'test/flows/README.md'
    ]
    const legacyPatterns = [
      /\bNameStatus\b/,
      /\bNameKind\b/,
      /\bNameApproved\b/,
      /chapter-Name/i,
      /proposal-Name/i,
      /makeNameAt/i,
      /review Name/i,
      /Name gate/i,
      /Name pages/i,
      /Name tạo/i,
      /cascade Name/i,
      /khâu Name/i,
      /Name chapter/i,
      /Name revision/i,
      /Name-scoped/i,
      /Name gone/i,
      /không còn Name/i,
      /chưa approve name/i,
      /proposal name pages/i,
      /nếu Name/i,
      /đổi tên từ `name\//i
    ]

    for (const file of files) {
      const source = readFileSync(join(repoRoot, file), 'utf8')
      for (const pattern of legacyPatterns) expect(source).not.toMatch(pattern)
    }
  })

  it('flow proves all seven removed routes with their original HTTP methods', () => {
    const flow = readFileSync(join(__dirname, '../../../../test/flows/flow-01-serialization.ts'), 'utf8')
    const requiredContracts: Array<[string, string]> = [
      ['GET', ''],
      ['GET', '/000000000000000000000000'],
      ['POST', '/000000000000000000000000/approve'],
      ['POST', '/000000000000000000000000/request-revision'],
      ['POST', '/000000000000000000000000/resubmit'],
      ['POST', '/000000000000000000000000/pages'],
      ['PUT', '/000000000000000000000000/pages']
    ]
    for (const [method, suffix] of requiredContracts) {
      expect(flow).toMatch(new RegExp(`method: '${method}',\\s+suffix: '${suffix}'`))
    }
    expect(flow).toContain('const expectedRouterMessage = `Cannot ${route.method} ${path}`')
    expect(flow).toContain('gone.status === 404 && gone.json?.message === expectedRouterMessage')
  })
})
