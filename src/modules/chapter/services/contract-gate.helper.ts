import { SeriesStatus } from '@prisma/client'
import { ENDING_SERIES_STATUSES } from '../chapter.constant'
import { ContractNotExecutedException } from '../errors/chapter.errors'

type ContractGateRepository = {
  findExecutedContractBySeriesId(seriesId: string): Promise<{ id: string } | null>
  findEverExecutedContractBySeriesId(seriesId: string): Promise<{ id: string } | null>
}

// BR-CONTRACT-05 — nguồn sự thật DUY NHẤT của cổng hợp đồng cho vòng đời chương.
// Dùng ở CẢ hai đầu: mở chương (`POST /chapters`) và xuất bản (`POST /chapters/:id/publish`) để hai bên
// không lệch luật. Ngoài giai đoạn kết thúc thì đòi hợp đồng đang `FULLY_EXECUTED`; trong giai đoạn kết thúc
// chỉ đòi bộ truyện ĐÃ TỪNG có hợp đồng hiệu lực (xem ghi chú ở `ENDING_SERIES_STATUSES`).
export async function assertSeriesContractGate(
  repository: ContractGateRepository,
  series: { id: string; status: SeriesStatus }
): Promise<void> {
  const contract = ENDING_SERIES_STATUSES.includes(series.status)
    ? await repository.findEverExecutedContractBySeriesId(series.id)
    : await repository.findExecutedContractBySeriesId(series.id)
  if (!contract) throw ContractNotExecutedException
}
