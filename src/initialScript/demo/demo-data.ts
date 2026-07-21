import { RoleCode, Specialization } from '@prisma/client'

export const DEMO_EMAIL_DOMAIN = 'demo.mangaka.local'
export const DEMO_DEFAULT_PASSWORD = 'MangaDemo!2026'
export const DEMO_ITERATIONS = 10
export const DEMO_HISTORY_DAYS = 14

export interface DemoAccount {
  alias: string
  email: string
  name: string
  displayName: string
  role: RoleCode
  phoneNumber: string
}

const account = (
  alias: string,
  displayName: string,
  role: RoleCode,
  phoneSuffix: string,
  name = displayName
): DemoAccount => ({
  alias,
  email: `${alias}@${DEMO_EMAIL_DOMAIN}`,
  name,
  displayName,
  role,
  phoneNumber: `+8491${phoneSuffix.padStart(7, '0')}`
})

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  account('mangaka.akari', 'Akari Mori', RoleCode.MANGAKA, '1000001'),
  account('mangaka.ren', 'Ren Takahashi', RoleCode.MANGAKA, '1000002'),
  account('mangaka.sora', 'Sora Nguyen', RoleCode.MANGAKA, '1000003'),
  account('assistant.yuki', 'Yuki Sato', RoleCode.ASSISTANT, '2000001'),
  account('assistant.hana', 'Hana Ito', RoleCode.ASSISTANT, '2000002'),
  account('assistant.minh', 'Minh Tran', RoleCode.ASSISTANT, '2000003'),
  account('assistant.emi', 'Emi Kato', RoleCode.ASSISTANT, '2000004'),
  account('assistant.kei', 'Kei Watanabe', RoleCode.ASSISTANT, '2000005'),
  account('assistant.linh', 'Linh Pham', RoleCode.ASSISTANT, '2000006'),
  account('editor.naomi', 'Naomi Fujita', RoleCode.EDITOR, '3000001'),
  account('editor.duc', 'Duc Le', RoleCode.EDITOR, '3000002'),
  account('board.aya', 'Aya Nakamura', RoleCode.BOARD_MEMBER, '4000001'),
  account('board.kenji', 'Kenji Hayashi', RoleCode.BOARD_MEMBER, '4000002'),
  account('board.mai', 'Mai Shimizu', RoleCode.BOARD_MEMBER, '4000003'),
  account('board.taro', 'Taro Kobayashi', RoleCode.BOARD_MEMBER, '4000004'),
  account('board.an', 'An Hoang', RoleCode.BOARD_MEMBER, '4000005')
] as const

export const DEMO_SPECIALIZATIONS: readonly Specialization[][] = [
  [Specialization.BACKGROUND, Specialization.INKING],
  [Specialization.SCREENTONE, Specialization.EFFECT_LINES],
  [Specialization.LETTERING, Specialization.COLORING],
  [Specialization.BACKGROUND, Specialization.SCREENTONE],
  [Specialization.INKING, Specialization.EFFECT_LINES],
  [Specialization.LETTERING, Specialization.SCREENTONE]
] as const

export const FLOW_ONE_TITLES = [
  'Paper Moon Courier',
  'Clockwork Shrine',
  'Saltwind Academy',
  'The Last Tanuki Train',
  'Lanterns After Rain',
  'Zero Hour Bento',
  'Foxfire Frequency',
  'Orbiting Koi',
  'The Ink Alchemist',
  'Midnight Library Club'
] as const

export const FLOW_SIX_TITLES = [
  'Amber Blade Chronicle',
  'Blue Comet Kitchen',
  'City of Paper Cranes',
  'Driftwood Exorcist',
  'Electric Lotus',
  'Falling Star Detective',
  'Glass Garden Runners',
  'Harbor of Lost Names',
  'Iron Cicada',
  'Jade Signal'
] as const

export const TASK_INSTRUCTIONS: Readonly<Record<Specialization, string>> = {
  BACKGROUND: 'Dựng con hẻm Edo theo phối cảnh 2 điểm tụ; giữ khoảng trống quanh nhân vật chính.',
  SCREENTONE: 'Dùng tone 20% cho tiền cảnh và 40% cho lớp bóng; tránh moiré khi thu nhỏ.',
  EFFECT_LINES: 'Thêm speed lines hội tụ về bàn tay nhân vật, không che thoại.',
  INKING: 'Đi nét kiến trúc bằng G-pen, ưu tiên nét ngoài dày hơn chi tiết trong.',
  COLORING: 'Tô bảng màu hoàng hôn cam–tím theo palette đính kèm.',
  LETTERING: 'Đặt thoại theo thứ tự đọc RTL; giữ safe margin tối thiểu 24 px.'
}
