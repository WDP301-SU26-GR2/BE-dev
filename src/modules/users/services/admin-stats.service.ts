import { Injectable } from '@nestjs/common'
import { $Enums } from '@prisma/client'
import { UsersRepository } from '../users.repo'

// Zero-fill đủ key enum để FE không phải phòng thủ key vắng (count 0 vẫn hiện).
function zeroMap<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>
}

@Injectable()
export class AdminStatsService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async getStats() {
    const [statusRows, roleRows, deleted, seriesRows, chapters, taskRows] = await Promise.all([
      this.usersRepository.groupUsersByStatus(),
      this.usersRepository.groupUsersByRole(),
      this.usersRepository.countDeletedUsers(),
      this.usersRepository.groupSeriesByStatus(),
      this.usersRepository.countChapters(),
      this.usersRepository.groupTasksByStatus()
    ])

    const usersByStatus = zeroMap(Object.values($Enums.UserStatus))
    for (const row of statusRows) usersByStatus[row.status] = row._count._all

    const usersByRole = zeroMap(Object.values($Enums.RoleCode))
    for (const row of roleRows) usersByRole[row.role.code] = row._count._all

    const seriesByStatus = zeroMap(Object.values($Enums.SeriesStatus))
    for (const row of seriesRows) seriesByStatus[row.status] = row._count._all

    const tasksByStatus = zeroMap(Object.values($Enums.TaskStatus))
    for (const row of taskRows) tasksByStatus[row.status] = row._count._all

    const sum = (record: Record<string, number>) => Object.values(record).reduce((total, count) => total + count, 0)

    return {
      users: { total: sum(usersByStatus), deleted, byStatus: usersByStatus, byRole: usersByRole },
      series: { total: sum(seriesByStatus), byStatus: seriesByStatus },
      chapters,
      tasks: { total: sum(tasksByStatus), byStatus: tasksByStatus }
    }
  }
}
