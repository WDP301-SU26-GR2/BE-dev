import { RoleName } from 'src/core/security/constants/role.constant'
import { NameQueryService } from './name-query.service'

const SERIES_ID = '0123456789abcdef01234567'

describe('NameQueryService', () => {
  it('rejects an unrelated editor before loading names', async () => {
    const repository = {
      findSeriesForGuard: jest.fn().mockResolvedValue({ id: SERIES_ID, editorId: 'assigned', mangakaId: 'owner' }),
      findNamesBySeriesIdAndKind: jest.fn()
    }
    const service = new NameQueryService(repository as never)

    await expect(
      service.listNames({ userId: 'other-editor', roleName: RoleName.EDITOR }, SERIES_ID)
    ).rejects.toMatchObject({ status: 403 })
    expect(repository.findNamesBySeriesIdAndKind).not.toHaveBeenCalled()
  })

  it('returns proposal names for the assigned editor', async () => {
    const repository = {
      findSeriesForGuard: jest.fn().mockResolvedValue({ id: SERIES_ID, editorId: 'assigned', mangakaId: 'owner' }),
      findNamesBySeriesIdAndKind: jest.fn().mockResolvedValue([])
    }
    const service = new NameQueryService(repository as never)

    await expect(service.listNames({ userId: 'assigned', roleName: RoleName.EDITOR }, SERIES_ID)).resolves.toEqual({
      items: []
    })
  })
})
