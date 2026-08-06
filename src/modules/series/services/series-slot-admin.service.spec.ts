import { PublicationType, SeriesStatus } from '@prisma/client'
import { SeriesSlotAdminService } from './series-slot-admin.service'
import { SeriesNotFoundException, SeriesSlotNotEditableException } from '../errors/series.errors'
import { MagazineNotRegisteredException } from 'src/modules/magazine/errors/magazine.errors'

const SID = 'a'.repeat(24) // ObjectId hợp lệ (guard isObjectId chạy trước findById)

function setup(series: unknown) {
  const seriesQueryRepository = { findById: jest.fn().mockResolvedValue(series) }
  const seriesRepository = { updateSerializationSlot: jest.fn().mockResolvedValue(undefined) }
  const magazineRegistryService = {
    assertSlotAllowed: jest.fn().mockResolvedValue(undefined),
    assertPublicationTypeAllowed: jest.fn().mockResolvedValue(undefined)
  }
  const auditService = { record: jest.fn().mockResolvedValue(undefined) }
  const service = new SeriesSlotAdminService(
    seriesQueryRepository as never,
    seriesRepository as never,
    magazineRegistryService as never,
    auditService as never
  )
  return { service, seriesQueryRepository, seriesRepository, magazineRegistryService, auditService }
}

const serializedSeries = {
  id: SID,
  status: SeriesStatus.SERIALIZED,
  magazine: 'FT Jump',
  startIssueNumber: 5,
  publicationType: PublicationType.MONTHLY
}

describe('SeriesSlotAdminService.updateSlot', () => {
  it('sửa slot cho series SERIALIZED → ghi slot + audit SLOT_CORRECTED', async () => {
    const f = setup(serializedSeries)
    await f.service.updateSlot(SID, { magazine: '  FT  Jump ', publicationType: PublicationType.WEEKLY }, 'admin')
    expect(f.seriesRepository.updateSerializationSlot).toHaveBeenCalledWith(SID, {
      magazine: 'FT Jump',
      startIssueNumber: 5,
      publicationType: PublicationType.WEEKLY
    })
    expect(f.auditService.record).toHaveBeenCalledTimes(1)
    expect(f.auditService.record.mock.calls[0][0]).toMatchObject({ action: 'SLOT_CORRECTED' })
  })

  it('chặn series chưa có slot (DRAFT/PITCHED) → SeriesSlotNotEditable', async () => {
    const f = setup({ ...serializedSeries, status: SeriesStatus.PITCHED })
    await expect(f.service.updateSlot(SID, { startIssueNumber: 2 }, 'admin')).rejects.toBe(
      SeriesSlotNotEditableException
    )
    expect(f.seriesRepository.updateSerializationSlot).not.toHaveBeenCalled()
  })

  it('id rác (không 24-hex) → 404 SeriesNotFound trước khi query (AGENTS §10)', async () => {
    const f = setup(serializedSeries)
    await expect(f.service.updateSlot('bad', { startIssueNumber: 2 }, 'admin')).rejects.toBe(SeriesNotFoundException)
    expect(f.seriesQueryRepository.findById).not.toHaveBeenCalled()
  })

  it('id hợp lệ nhưng không tồn tại → 404 SeriesNotFound', async () => {
    const f = setup(null)
    await expect(f.service.updateSlot(SID, { startIssueNumber: 2 }, 'admin')).rejects.toBe(SeriesNotFoundException)
  })

  it('magazine ∉ registry → MagazineNotRegistered (từ assertSlotAllowed)', async () => {
    const f = setup(serializedSeries)
    f.magazineRegistryService.assertSlotAllowed.mockRejectedValueOnce(MagazineNotRegisteredException)
    await expect(f.service.updateSlot(SID, { magazine: 'ko có' }, 'admin')).rejects.toBe(MagazineNotRegisteredException)
    expect(f.seriesRepository.updateSerializationSlot).not.toHaveBeenCalled()
  })

  // F12: chỉ đổi magazine → nhịp hiệu lực để kiểm = nhịp HIỆN TẠI của series (MONTHLY), KHÔNG mặc định WEEKLY.
  it('chỉ đổi magazine → kiểm registry theo publicationType hiện tại của series', async () => {
    const f = setup(serializedSeries)
    await f.service.updateSlot(SID, { magazine: 'FT Jump SQ' }, 'admin')
    expect(f.magazineRegistryService.assertSlotAllowed).toHaveBeenCalledWith('FT Jump SQ', PublicationType.MONTHLY)
  })

  // F12: chỉ đổi nhịp → kiểm nhịp mới theo magazine hiện tại của series.
  it('chỉ đổi publicationType → kiểm nhịp mới theo magazine hiện tại', async () => {
    const f = setup(serializedSeries)
    await f.service.updateSlot(SID, { publicationType: PublicationType.WEEKLY }, 'admin')
    expect(f.magazineRegistryService.assertPublicationTypeAllowed).toHaveBeenCalledWith(
      'FT Jump',
      PublicationType.WEEKLY
    )
  })
})
