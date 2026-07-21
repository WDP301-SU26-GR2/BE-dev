import { TaskFileForbiddenException, TaskNotFoundException } from '../errors/task.errors'
import { TaskMediaService } from './task-media.service'

const TASK = '012345678901234567890123'

function makeCtx(over: Record<string, unknown> = {}) {
  return {
    task: { id: TASK, assistantId: 'assistant', versions: [{ file: 'r2://result-v1.png' }] },
    page: {
      originalFile: 'r2://page-original.png',
      compositeFile: 'r2://page-composite.png',
      chapter: { series: { mangakaId: 'mangaka', editorId: 'editor' } }
    },
    // Key ảnh reference Mangaka đính khi giao task (A-TSK-09) — resolve từ Task.assetIds → Asset.filePath.
    assetKeys: ['r2://reference-a.png'],
    ...over
  }
}

function makeSvc(ctx: unknown) {
  const repo = { findTaskDownloadContext: jest.fn().mockResolvedValue(ctx) }
  const storage = {
    createPresignedDownload: jest.fn().mockResolvedValue({ downloadUrl: 'https://signed', expiresAt: 'iso' })
  }
  const svc = new TaskMediaService(repo as never, storage as never)
  return { svc, repo, storage }
}

describe('TaskMediaService.getDownloadUrl', () => {
  it('lets the series-owning Mangaka download the assistant-submitted version file', async () => {
    const { svc, storage } = makeSvc(makeCtx())
    const res = await svc.getDownloadUrl({ userId: 'mangaka', roleName: 'MANGAKA' }, TASK, 'r2://result-v1.png')
    expect(storage.createPresignedDownload).toHaveBeenCalledWith('r2://result-v1.png')
    expect(res.downloadUrl).toBe('https://signed')
  })

  it('lets the assignee Assistant download the page base image (to work on)', async () => {
    const { svc, storage } = makeSvc(makeCtx())
    await svc.getDownloadUrl({ userId: 'assistant', roleName: 'ASSISTANT' }, TASK, 'r2://page-original.png')
    expect(storage.createPresignedDownload).toHaveBeenCalledWith('r2://page-original.png')
  })

  it('lets the assignee Assistant download a reference asset the Mangaka attached (assetIds)', async () => {
    const { svc, storage } = makeSvc(makeCtx())
    await svc.getDownloadUrl({ userId: 'assistant', roleName: 'ASSISTANT' }, TASK, 'r2://reference-a.png')
    expect(storage.createPresignedDownload).toHaveBeenCalledWith('r2://reference-a.png')
  })

  it('lets the series Editor download a task file', async () => {
    const { svc } = makeSvc(makeCtx())
    await expect(
      svc.getDownloadUrl({ userId: 'editor', roleName: 'EDITOR' }, TASK, 'r2://result-v1.png')
    ).resolves.toBeDefined()
  })

  it('rejects an unrelated Mangaka (not owner/assignee/editor) with 403', async () => {
    const { svc, storage } = makeSvc(makeCtx())
    await expect(
      svc.getDownloadUrl({ userId: 'other-mangaka', roleName: 'MANGAKA' }, TASK, 'r2://result-v1.png')
    ).rejects.toBe(TaskFileForbiddenException)
    expect(storage.createPresignedDownload).not.toHaveBeenCalled()
  })

  it('rejects a key that does not belong to the task (anti-spoofing) with 403', async () => {
    const { svc } = makeSvc(makeCtx())
    await expect(
      svc.getDownloadUrl({ userId: 'mangaka', roleName: 'MANGAKA' }, TASK, 'r2://some-other-secret.png')
    ).rejects.toBe(TaskFileForbiddenException)
  })

  it('yields 404 for a malformed task id without hitting the repository', async () => {
    const { svc, repo } = makeSvc(makeCtx())
    await expect(svc.getDownloadUrl({ userId: 'mangaka', roleName: 'MANGAKA' }, 'bad', 'k')).rejects.toBe(
      TaskNotFoundException
    )
    expect(repo.findTaskDownloadContext).not.toHaveBeenCalled()
  })

  it('yields 404 when the task does not exist', async () => {
    const { svc } = makeSvc(null)
    await expect(svc.getDownloadUrl({ userId: 'mangaka', roleName: 'MANGAKA' }, TASK, 'k')).rejects.toBe(
      TaskNotFoundException
    )
  })
})
