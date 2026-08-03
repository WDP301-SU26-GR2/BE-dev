import { z } from 'zod'

// Trần nghiệp vụ cho mọi khoản tiền trong hệ thống (đơn vị VND).
// Mục đích: bắt lỗi nhập thừa số 0. Ngưỡng kỹ thuật (mất chính xác số) đã được `.int()` che —
// zod từ chối số vượt safe-integer, nên trần này thuần tuý là ràng buộc nghiệp vụ.
export const MONEY_MAX = 100_000_000_000

// Trần số bản in đã bán của một tập tankobon.
export const UNITS_SOLD_MAX = 1_000_000_000

/**
 * Schema tiền dùng chung. VND không có đơn vị nhỏ hơn đồng nên bắt buộc số nguyên.
 * `z.number()` của zod 4 đã tự từ chối NaN/Infinity — không cần `.finite()`.
 *
 * CHỈ áp cho schema INPUT — schema response để ngỏ để tránh vỡ dữ liệu cũ.
 */
export const zMoney = (opts: { positive?: boolean } = {}) => {
  const base = z
    .number({ error: 'Giá trị tiền phải là một số' })
    .int({ message: 'Giá trị tiền phải là số nguyên (đơn vị đồng)' })
    .max(MONEY_MAX, { message: `Giá trị tiền không được vượt quá ${MONEY_MAX.toLocaleString('vi-VN')} đồng` })
  return opts.positive
    ? base.positive({ message: 'Giá trị tiền phải lớn hơn 0' })
    : base.nonnegative({ message: 'Giá trị tiền không được âm' })
}
