import { NotAssignedEditorException } from '../errors/series.errors'
import { requireAssignedEditor } from './series-editor.guard'

describe('requireAssignedEditor', () => {
  it('passes when editorId matches callerId', () => {
    expect(() => requireAssignedEditor({ editorId: 'e1' }, 'e1')).not.toThrow()
  })

  it('throws when another editor is assigned', () => {
    expect(() => requireAssignedEditor({ editorId: 'e2' }, 'e1')).toThrow(NotAssignedEditorException)
  })

  it('throws when no editor is assigned', () => {
    expect(() => requireAssignedEditor({ editorId: null }, 'e1')).toThrow(NotAssignedEditorException)
  })
})
