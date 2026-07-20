import type { CacheService } from './cache.service'

/**
 * Test double cho CacheService (Spec 23).
 *
 * Vì sao tồn tại: trước đây 7 service khai `cacheService` bằng **tham số có giá trị mặc định**
 * là stub no-op để unit test cũ khỏi phải sửa. Hệ quả: 40 test chạy qua đường KHÔNG cache,
 * và nếu DI hỏng thì cache + invalidation tắt im lặng mà 0 test đỏ (đúng lớp mock-blindspot).
 * Nay dependency là BẮT BUỘC; test phải truyền double này một cách tường minh.
 *
 * Hành vi mặc định = pass-through (luôn gọi loader) để assert nghiệp vụ sẵn có không đổi,
 * nhưng `getOrSet`/`bumpVersion` là jest.fn() nên test CÓ THỂ assert cache/bump được gọi đúng.
 */
export type CacheServiceMock = {
  getOrSet: jest.Mock
  bumpVersion: jest.Mock
}

export const makeCacheServiceMock = (): CacheServiceMock => ({
  getOrSet: jest.fn((_ns: string, _suffix: string, _ttl: number, loader: () => unknown) => loader()),
  bumpVersion: jest.fn().mockResolvedValue(undefined)
})

/** Ép kiểu tại điểm truyền vào constructor — giữ call site gọn. */
export const asCacheService = (mock: CacheServiceMock): CacheService => mock as unknown as CacheService
