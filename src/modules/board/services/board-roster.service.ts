import { Injectable } from '@nestjs/common'
import { Genre } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { BoardRepository } from '../board.repo'
import { NotEnoughBoardMembersException, SeriesNotFoundException } from '../errors/board.errors'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

// Ràng buộc cứng từ code có sẵn: CreateBoardSessionBodySchema.allowedEditorIds có .min(3),
// và board.service.createSession throw nếu roster CHẴN (B-BRD-05, chống hoà phiếu).
// → roster hợp lệ LUÔN lẻ và >= 3.
const MIN_ROSTER = 3

export type RosterCandidate = {
  userId: string
  displayName: string | null
  avatar: string | null
  specialtyGenres: Genre[]
  matchedGenres: Genre[]
  score: number
  hasProfile: boolean
}

@Injectable()
export class BoardRosterService {
  constructor(private readonly boardRepo: BoardRepository) {}

  /**
   * PB-05 / Requiment Flow 1: "Hệ thống tự phân công Board member theo sở trường thể loại của tác phẩm".
   * Chấm điểm = số genre giao nhau; sắp xếp DETERMINISTIC (test không được flaky).
   */
  async suggest(seriesId: string, size?: number): Promise<{ items: RosterCandidate[]; size: number }> {
    if (!OBJECT_ID_RE.test(seriesId)) throw SeriesNotFoundException
    const series = await this.boardRepo.findSeriesGenres(seriesId)
    if (!series) throw SeriesNotFoundException

    const roleId = await this.boardRepo.findRoleIdByCode(RoleName.BOARD_MEMBER)
    if (!roleId) throw NotEnoughBoardMembersException

    const rows = await this.boardRepo.findActiveBoardMembers(roleId)
    const seriesGenres = new Set<Genre>(series.genres)

    const scored = rows
      .map((u) => {
        const specialtyGenres = u.staffProfile?.specialtyGenres ?? []
        const matchedGenres = specialtyGenres.filter((g) => seriesGenres.has(g))
        return {
          userId: u.id,
          displayName: u.displayName ?? null,
          avatar: u.avatar ?? null,
          specialtyGenres,
          matchedGenres,
          score: matchedGenres.length,
          hasProfile: Boolean(u.staffProfile),
          createdAt: u.createdAt
        }
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          Number(b.hasProfile) - Number(a.hasProfile) ||
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.userId.localeCompare(b.userId)
      )

    const available = scored.length
    if (available < MIN_ROSTER) throw NotEnoughBoardMembersException

    // `getActiveConfig()` = method CÓ SẴN trong board.repo (boardConfig.findFirst). KHÔNG đổi tên.
    const config = await this.boardRepo.getActiveConfig()
    const requested = size ?? config?.quorumMin ?? 0
    let target = Math.max(MIN_ROSTER, requested)
    if (target % 2 === 0) target += 1
    if (target > available) target = available % 2 === 1 ? available : available - 1

    const items = scored.slice(0, target).map((s) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { createdAt, ...rest } = s
      return rest
    })
    return { items, size: items.length }
  }
}
