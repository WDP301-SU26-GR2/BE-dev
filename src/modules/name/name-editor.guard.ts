import { NotAssignedEditorException } from './errors/name.errors'

// Series chỉ giao cho 1 editor duy nhất; editorId = null ⇒ chưa có ai claim ⇒ reject (guard single-writer).
export function requireAssignedEditor(series: { editorId: string | null }, callerId: string): void {
  if (!series.editorId || series.editorId !== callerId) throw NotAssignedEditorException
}
