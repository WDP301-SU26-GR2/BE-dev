/**
 * Chuẩn hoá tên tạp chí trước khi ghi/so khớp.
 * `magazine` là KHOÁ LIÊN KẾT dạng chuỗi giữa Series ↔ SurveyPeriod ↔ RankingRecord,
 * nên hai bên ghi lệch nhau một khoảng trắng là kỳ bình chọn tìm không ra series.
 */
export const normalizeMagazine = (value: string): string => value.trim().replace(/\s+/g, ' ')
