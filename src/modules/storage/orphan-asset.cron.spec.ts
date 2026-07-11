import { OrphanAssetCron } from './orphan-asset.cron'

describe('OrphanAssetCron', () => {
  const makeDeps = (over: Record<string, unknown> = {}) => ({
    redis: { setNxEx: jest.fn().mockResolvedValue(true) },
    repo: {
      findStaleAssets: jest.fn().mockResolvedValue([
        { id: 'A1', filePath: 'k1' },
        { id: 'A2', filePath: 'k2' }
      ]),
      deleteAssetById: jest.fn().mockResolvedValue(undefined)
    },
    storage: { headObjectExists: jest.fn() },
    ...over
  })

  it('deletes HEAD-missing assets and keeps uploaded assets', async () => {
    const d = makeDeps()
    d.storage.headObjectExists = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const cron = new OrphanAssetCron(d.redis as never, d.repo as never, d.storage as never)

    await cron.run()

    expect(d.repo.deleteAssetById).toHaveBeenCalledTimes(1)
    expect(d.repo.deleteAssetById).toHaveBeenCalledWith('A1')
  })

  it('skips when Redis lock is not acquired', async () => {
    const d = makeDeps({ redis: { setNxEx: jest.fn().mockResolvedValue(false) } })
    const cron = new OrphanAssetCron(d.redis as never, d.repo as never, d.storage as never)

    await cron.run()

    expect(d.repo.findStaleAssets).not.toHaveBeenCalled()
  })

  it('1 asset lỗi → KHÔNG chết cả tick, asset còn lại vẫn được xử lý', async () => {
    const d = makeDeps()
    d.storage.headObjectExists = jest.fn().mockRejectedValueOnce(new Error('r2 timeout')).mockResolvedValueOnce(false)
    const cron = new OrphanAssetCron(d.redis as never, d.repo as never, d.storage as never)
    jest.spyOn((cron as never as { logger: { error: jest.Mock } }).logger, 'error').mockImplementation(() => undefined)

    await expect(cron.run()).resolves.toBeUndefined()

    expect(d.repo.deleteAssetById).toHaveBeenCalledTimes(1)
    expect(d.repo.deleteAssetById).toHaveBeenCalledWith('A2')
  })
})
