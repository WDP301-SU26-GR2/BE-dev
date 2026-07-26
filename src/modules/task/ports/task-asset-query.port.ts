export abstract class TaskAssetQueryPort {
  abstract findExistingAssetIds(ids: string[]): Promise<string[]>
}
