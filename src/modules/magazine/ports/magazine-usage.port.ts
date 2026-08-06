/**
 * Danh mục tạp chí sống ở AppConfig, nhưng dữ liệu ĐANG DÙNG tạp chí nằm ở module khác
 * (Series, SurveyPeriod). Repository là private theo module (AGENTS §5) ⇒ đi qua port.
 */
export abstract class MagazineUsagePort {
  /** Số bản ghi đang dùng đúng tên tạp chí này (đã normalize). */
  abstract countByMagazine(magazine: string): Promise<number>
  /** Số bản ghi đang dùng đúng cặp (tạp chí, nhịp phát hành). */
  abstract countByMagazineAndType(magazine: string, publicationType: string): Promise<number>
}
