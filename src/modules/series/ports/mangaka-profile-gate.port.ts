/**
 * Port (consumer = series): kiểm tra Mangaka đã build hồ sơ (`MangakaProfile`) chưa.
 * Provider = users module bind adapter. Dùng cho gate submit proposal (AGENTS §9).
 */
export abstract class MangakaProfileGatePort {
  abstract hasProfile(userId: string): Promise<boolean>
}
