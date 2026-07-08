import { RoleName } from 'src/core/security/constants/role.constant'
import {
  PublicationVersionNotFoundException,
  SeriesAccessDeniedException,
  SeriesNotFoundException
} from '../errors/publication.errors'
import { PublicationService } from '../publication.service'

const SERIES_ID = '507f1f77bcf86cd799439041'
const VER_ID = '507f1f77bcf86cd799439042'

function make(
  seriesOverride: { id: string; mangakaId: string; editorId: string | null } | null = {
    id: SERIES_ID,
    mangakaId: 'mangaka-1',
    editorId: 'editor-1'
  }
) {
  const versionEntity = {
    id: VER_ID,
    seriesId: SERIES_ID,
    language: 'JA',
    readingDirection: 'RTL' as const,
    versionType: null,
    notes: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z')
  }
  const updatedEntity = { ...versionEntity, language: 'EN', readingDirection: 'LTR' as const, notes: 'x' }
  const repo = {
    findSeriesBasics: jest.fn().mockResolvedValue(seriesOverride),
    create: jest.fn().mockResolvedValue(versionEntity),
    findManyBySeries: jest.fn().mockResolvedValue([versionEntity]),
    findById: jest.fn().mockResolvedValue(versionEntity),
    update: jest.fn().mockResolvedValue(updatedEntity),
    delete: jest.fn().mockResolvedValue(versionEntity)
  }
  return { svc: new PublicationService(repo as never), repo }
}

describe('PublicationService (B-PUB-01)', () => {
  it('create: EDITOR of series OK', async () => {
    const { svc, repo } = make()
    await svc.create('editor-1', RoleName.EDITOR, SERIES_ID, { language: 'JA', readingDirection: 'RTL' })
    expect(repo.create).toHaveBeenCalledWith(SERIES_ID, expect.objectContaining({ language: 'JA' }))
  })

  it('create: EDITOR not assigned → 403 SeriesAccessDenied', async () => {
    const { svc } = make()
    await expect(
      svc.create('other', RoleName.EDITOR, SERIES_ID, { language: 'JA', readingDirection: 'RTL' })
    ).rejects.toBe(SeriesAccessDeniedException)
  })

  it('create: SUPER_ADMIN bypasses scope', async () => {
    const { svc, repo } = make()
    await svc.create('admin-1', RoleName.SUPER_ADMIN, SERIES_ID, { language: 'JA', readingDirection: 'RTL' })
    expect(repo.create).toHaveBeenCalled()
  })

  it('create: BOARD_MEMBER bypasses scope (read-only allowed)', async () => {
    const { svc, repo } = make()
    await svc.create('board-1', RoleName.BOARD_MEMBER, SERIES_ID, { language: 'JA', readingDirection: 'RTL' })
    expect(repo.create).toHaveBeenCalled()
  })

  it('create: series not found → 404 SeriesNotFound', async () => {
    const { svc } = make(null)
    await expect(
      svc.create('editor-1', RoleName.EDITOR, SERIES_ID, { language: 'JA', readingDirection: 'RTL' })
    ).rejects.toBe(SeriesNotFoundException)
  })

  it('create: malformed seriesId → 404 SeriesNotFound', async () => {
    const { svc } = make()
    await expect(
      svc.create('editor-1', RoleName.EDITOR, 'garbage', { language: 'JA', readingDirection: 'RTL' })
    ).rejects.toBe(SeriesNotFoundException)
  })

  it('list: MANGAKA of series OK', async () => {
    const { svc, repo } = make()
    await svc.listBySeries('mangaka-1', RoleName.MANGAKA, SERIES_ID)
    expect(repo.findManyBySeries).toHaveBeenCalledWith(SERIES_ID)
  })

  it('list: MANGAKA not owner → 403 SeriesAccessDenied', async () => {
    const { svc } = make()
    await expect(svc.listBySeries('other', RoleName.MANGAKA, SERIES_ID)).rejects.toBe(SeriesAccessDeniedException)
  })

  it('detail: malformed id → 404 PublicationVersionNotFound', async () => {
    const { svc } = make()
    await expect(svc.getById('editor-1', RoleName.EDITOR, 'garbage')).rejects.toBe(PublicationVersionNotFoundException)
  })

  it('detail: BOARD_MEMBER can read', async () => {
    const { svc, repo } = make()
    await svc.getById('board-1', RoleName.BOARD_MEMBER, VER_ID)
    expect(repo.findById).toHaveBeenCalledWith(VER_ID)
  })

  it('update: EDITOR of series OK', async () => {
    const { svc, repo } = make()
    await svc.update('editor-1', RoleName.EDITOR, VER_ID, { notes: 'updated' })
    expect(repo.update).toHaveBeenCalledWith(VER_ID, expect.objectContaining({ notes: 'updated' }))
  })

  it('update: EDITOR not assigned → 403', async () => {
    const { svc } = make()
    await expect(svc.update('other', RoleName.EDITOR, VER_ID, { notes: 'x' })).rejects.toBe(SeriesAccessDeniedException)
  })

  it('update: version not found → 404', async () => {
    const { svc, repo } = make()
    repo.findById.mockResolvedValue(null)
    await expect(svc.update('editor-1', RoleName.EDITOR, VER_ID, { notes: 'x' })).rejects.toBe(
      PublicationVersionNotFoundException
    )
  })

  it('remove: SUPER_ADMIN OK + returns deleted message', async () => {
    const { svc, repo } = make()
    const result = await svc.remove('admin-1', RoleName.SUPER_ADMIN, VER_ID)
    expect(repo.delete).toHaveBeenCalledWith(VER_ID)
    expect(result.message).toBe('Publication version deleted')
  })

  it('remove: MANGAKA of series OK (controller @Roles blocks, but service permits owner)', async () => {
    const { svc, repo } = make()
    await svc.remove('mangaka-1', RoleName.MANGAKA, VER_ID)
    expect(repo.delete).toHaveBeenCalledWith(VER_ID)
  })

  it('remove: MANGAKA not owner → 403', async () => {
    const { svc } = make()
    await expect(svc.remove('other-mangaka', RoleName.MANGAKA, VER_ID)).rejects.toBe(SeriesAccessDeniedException)
  })
})
