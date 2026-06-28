import { NotAssignedEditorException } from '../errors/series.errors'

export function requireAssignedEditor(series: { editorId: string | null }, callerId: string): void {
  if (series.editorId !== callerId) throw NotAssignedEditorException
}
