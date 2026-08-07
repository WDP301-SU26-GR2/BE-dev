import { PublicationType } from '@prisma/client'
import { MagazineRegistryService } from './magazine.service'
import {
  MagazineAlreadyExistsException,
  MagazineInUseException,
  MagazineNotFoundException,
  PublicationTypeInUseException,
  MagazineNotRegisteredException,
  PublicationTypeNotSupportedException
} from './errors/magazine.errors'

const MAGAZINE_ENTRY = {
  name: 'FT Jump',
  publicationTypes: ['WEEKLY', 'MONTHLY'] as PublicationType[]
}

const CONFIG_ID = '507f1f77bcf86cd799439011'

function make() {
  const initial = [{ ...MAGAZINE_ENTRY, publicationTypes: [...MAGAZINE_ENTRY.publicationTypes] }]
  // AppConfig SỞ HỮU field magazines[]; MagazineRegistryService đọc/ghi qua accessor của AppConfigService.
  const appConfigService = {
    getMagazines: jest.fn().mockResolvedValue(initial),
    replaceMagazines: jest.fn().mockImplementation((magazines: unknown) => ({ configId: CONFIG_ID, magazines }))
  }
  const auditService = { record: jest.fn().mockResolvedValue(undefined) }
  const seriesAdapter = {
    countByMagazine: jest.fn().mockResolvedValue(0),
    countByMagazineAndType: jest.fn().mockResolvedValue(0)
  }
  const surveyAdapter = {
    countByMagazine: jest.fn().mockResolvedValue(0),
    countByMagazineAndType: jest.fn().mockResolvedValue(0)
  }
  const service = new MagazineRegistryService(
    appConfigService as never,
    auditService as never,
    seriesAdapter as never,
    surveyAdapter as never
  )
  return { service, appConfigService, auditService, seriesAdapter, surveyAdapter }
}

describe('MagazineRegistryService', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-06-23T00:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('getMagazines', () => {
    it('trả về danh sách magazines từ config', async () => {
      const { service } = make()
      const result = await service.getMagazines()
      expect(result).toEqual([MAGAZINE_ENTRY])
    })

    it('trả về mảng rỗng khi không có magazines', async () => {
      const { service, appConfigService } = make()
      appConfigService.getMagazines.mockResolvedValueOnce([])
      const result = await service.getMagazines()
      expect(result).toEqual([])
    })
  })

  describe('getMagazine', () => {
    it('trả về magazine khi tìm thấy', async () => {
      const { service } = make()
      const result = await service.getMagazine('FT Jump')
      expect(result).toEqual(MAGAZINE_ENTRY)
    })

    it('normalize tên trước khi tìm kiếm (trim whitespace)', async () => {
      const { service } = make()
      const result = await service.getMagazine('  FT Jump  ')
      expect(result).toEqual(MAGAZINE_ENTRY)
    })

    it('trả về null khi không tìm thấy', async () => {
      const { service } = make()
      const result = await service.getMagazine('Unknown Magazine')
      expect(result).toBeNull()
    })
  })

  describe('isRegistered', () => {
    it('trả về true khi magazine đã đăng ký', async () => {
      const { service } = make()
      const result = await service.isRegistered('FT Jump')
      expect(result).toBe(true)
    })

    it('trả về false khi magazine chưa đăng ký', async () => {
      const { service } = make()
      const result = await service.isRegistered('Unknown')
      expect(result).toBe(false)
    })

    it('normalize tên trim whitespace trước khi kiểm tra', async () => {
      const { service } = make()
      const result = await service.isRegistered('  FT Jump  ')
      expect(result).toBe(true)
    })
  })

  describe('supportsPublicationType', () => {
    it('trả về true khi magazine hỗ trợ publication type', async () => {
      const { service } = make()
      const result = await service.supportsPublicationType('FT Jump', 'WEEKLY')
      expect(result).toBe(true)
    })

    it('trả về false khi magazine không hỗ trợ publication type', async () => {
      const { service } = make()
      const result = await service.supportsPublicationType('FT Jump', 'IRREGULAR')
      expect(result).toBe(false)
    })

    it('trả về false khi magazine không tồn tại', async () => {
      const { service } = make()
      const result = await service.supportsPublicationType('Unknown', 'WEEKLY')
      expect(result).toBe(false)
    })
  })

  describe('createMagazine', () => {
    it('tạo magazine mới thành công', async () => {
      const { service, appConfigService, auditService } = make()
      const result = await service.createMagazine('New Magazine', ['WEEKLY'], 'admin1')
      expect(result.name).toBe('New Magazine')
      expect(result.publicationTypes).toEqual(['WEEKLY'])
      expect(appConfigService.replaceMagazines).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'New Magazine' })]),
        'admin1'
      )
      expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'MAGAZINE_CREATE' }))
    })

    it('ném MagazineAlreadyExistsException khi tên trùng (case-sensitive)', async () => {
      const { service, appConfigService } = make()
      await expect(service.createMagazine('FT Jump', ['WEEKLY'], 'admin1')).rejects.toThrow(
        MagazineAlreadyExistsException
      )
      expect(appConfigService.replaceMagazines).not.toHaveBeenCalled()
    })
  })

  describe('updateMagazine', () => {
    it('cập nhật publication types thành công', async () => {
      const { service, auditService } = make()
      const result = await service.updateMagazine('FT Jump', ['IRREGULAR'], 'admin1')
      expect(result.publicationTypes).toEqual(['IRREGULAR'])
      expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'MAGAZINE_UPDATE' }))
    })

    it('ném MagazineNotFoundException khi không tìm thấy', async () => {
      const { service } = make()
      await expect(service.updateMagazine('Unknown', ['WEEKLY'], 'admin1')).rejects.toThrow(MagazineNotFoundException)
    })

    it('ném PublicationTypeInUseException khi xoá publication type đang được sử dụng', async () => {
      const { service, seriesAdapter } = make()
      seriesAdapter.countByMagazineAndType.mockResolvedValueOnce(1)
      // Remove WEEKLY (which is in use) but keep MONTHLY
      await expect(service.updateMagazine('FT Jump', ['MONTHLY'], 'admin1')).rejects.toThrow(
        PublicationTypeInUseException
      )
    })
  })

  describe('deleteMagazine', () => {
    it('xoá magazine thành công', async () => {
      const { service, appConfigService, auditService } = make()
      await service.deleteMagazine('FT Jump', 'admin1')
      expect(appConfigService.replaceMagazines).toHaveBeenCalledWith([], 'admin1')
      expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'MAGAZINE_DELETE' }))
    })

    it('ném MagazineNotFoundException khi không tìm thấy', async () => {
      const { service } = make()
      await expect(service.deleteMagazine('Unknown', 'admin1')).rejects.toThrow(MagazineNotFoundException)
    })

    it('ném MagazineInUseException khi magazine đang được sử dụng', async () => {
      const { service, seriesAdapter } = make()
      seriesAdapter.countByMagazine.mockResolvedValueOnce(1)
      await expect(service.deleteMagazine('FT Jump', 'admin1')).rejects.toThrow(MagazineInUseException)
    })
  })

  describe('assertSlotAllowed (gate SERIALIZATION)', () => {
    it('tạp chí trong danh mục + nhịp hợp lệ → OK', async () => {
      const { service } = make()
      await expect(service.assertSlotAllowed('FT Jump', 'WEEKLY')).resolves.toBeUndefined()
    })

    it('tạp chí ngoài danh mục → 422 MagazineNotRegisteredException', async () => {
      const { service } = make()
      await expect(service.assertSlotAllowed('Unknown Magazine', 'WEEKLY')).rejects.toThrow(
        MagazineNotRegisteredException
      )
    })

    it('nhịp không được tạp chí chấp nhận → 422 PublicationTypeNotSupportedException', async () => {
      const { service } = make()
      // FT Jump has WEEKLY and MONTHLY, not IRREGULAR
      await expect(service.assertSlotAllowed('FT Jump', 'IRREGULAR')).rejects.toThrow(
        PublicationTypeNotSupportedException
      )
    })

    it('danh mục rỗng → 422 (hardening: không serial hoá được khi chưa đăng ký tạp chí nào)', async () => {
      const { service, appConfigService } = make()
      appConfigService.getMagazines.mockResolvedValueOnce([])
      await expect(service.assertSlotAllowed('bất kỳ', 'WEEKLY')).rejects.toThrow(MagazineNotRegisteredException)
    })
  })

  describe('assertPublicationTypeAllowed (gate FORMAT_CHANGE)', () => {
    it('magazine null → bypass', async () => {
      const { service } = make()
      await expect(service.assertPublicationTypeAllowed(null, 'WEEKLY')).resolves.toBeUndefined()
    })

    it('nhịp được tạp chí chấp nhận → OK', async () => {
      const { service } = make()
      await expect(service.assertPublicationTypeAllowed('FT Jump', 'WEEKLY')).resolves.toBeUndefined()
    })

    it('nhịp không được tạp chí chấp nhận → 422', async () => {
      const { service } = make()
      await expect(service.assertPublicationTypeAllowed('FT Jump', 'IRREGULAR')).rejects.toThrow(
        PublicationTypeNotSupportedException
      )
    })

    it('danh mục rỗng → bypass', async () => {
      const { service, appConfigService } = make()
      appConfigService.getMagazines.mockResolvedValueOnce([])
      await expect(service.assertPublicationTypeAllowed('FT Jump', 'WEEKLY')).resolves.toBeUndefined()
    })
  })
})
