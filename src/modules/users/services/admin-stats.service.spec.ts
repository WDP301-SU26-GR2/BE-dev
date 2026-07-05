import { $Enums } from '@prisma/client'
import { AdminStatsService } from './admin-stats.service'

function makeService() {
  const usersRepository = {
    groupUsersByStatus: jest.fn().mockResolvedValue([]),
    groupUsersByRole: jest.fn().mockResolvedValue([]),
    countDeletedUsers: jest.fn().mockResolvedValue(0),
    groupSeriesByStatus: jest.fn().mockResolvedValue([]),
    countChapters: jest.fn().mockResolvedValue({ total: 0, published: 0 }),
    groupTasksByStatus: jest.fn().mockResolvedValue([])
  }
  const service = new AdminStatsService(usersRepository as never)
  return { service, usersRepository }
}

describe('AdminStatsService.getStats', () => {
  it('returns zero-filled maps for users/series/tasks and chapter counts', async () => {
    const { service, usersRepository } = makeService()
    usersRepository.groupUsersByStatus.mockResolvedValue([{ status: $Enums.UserStatus.ACTIVE, _count: { _all: 3 } }])
    usersRepository.groupUsersByRole.mockResolvedValue([
      { role: { code: $Enums.RoleCode.MANGAKA }, _count: { _all: 2 } }
    ])
    usersRepository.countDeletedUsers.mockResolvedValue(1)
    usersRepository.groupSeriesByStatus.mockResolvedValue([
      { status: $Enums.SeriesStatus.PITCHED, _count: { _all: 4 } }
    ])
    usersRepository.countChapters.mockResolvedValue({ total: 5, published: 2 })
    usersRepository.groupTasksByStatus.mockResolvedValue([{ status: $Enums.TaskStatus.CANCELLED, _count: { _all: 7 } }])

    const res = await service.getStats()

    expect(res.users.byStatus).toEqual({ INACTIVE: 0, ACTIVE: 3, BANNED: 0, BLOCKED: 0 })
    expect(res.users.byRole).toEqual({ MANGAKA: 2, ASSISTANT: 0, EDITOR: 0, BOARD_MEMBER: 0, SUPER_ADMIN: 0 })
    expect(res.users.total).toBe(3)
    expect(res.users.deleted).toBe(1)
    expect(res.series.byStatus.PITCHED).toBe(4)
    expect(res.series.byStatus.DRAFT).toBe(0)
    expect(res.series.total).toBe(4)
    expect(res.chapters).toEqual({ total: 5, published: 2 })
    expect(res.tasks.byStatus.CANCELLED).toBe(7)
    expect(res.tasks.byStatus.ASSIGNED).toBe(0)
    expect(res.tasks.total).toBe(7)
  })
})
