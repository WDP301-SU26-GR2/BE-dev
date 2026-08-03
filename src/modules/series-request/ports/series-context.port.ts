import { SeriesStatus } from '@prisma/client'

// Biên giới series-request → series (AGENTS §5 / ARCHITECTURE §13): repository là tài sản riêng của
// module sở hữu. Module này chỉ cần đọc vài thuộc tính để kiểm quyền và trạng thái, nên khai đúng
// bấy nhiêu — không kéo cả SeriesRepository sang.
export type SeriesContext = {
  id: string
  mangakaId: string
  editorId: string | null
  status: SeriesStatus
}

export abstract class SeriesContextPort {
  abstract findById(seriesId: string): Promise<SeriesContext | null>

  /** Id các bộ truyện mà người dùng sở hữu (mangaka) hoặc phụ trách (biên tập viên) — dùng để giới hạn phạm vi đọc. */
  abstract findSeriesIdsByOwner(key: 'mangakaId' | 'editorId', userId: string): Promise<string[]>
}
