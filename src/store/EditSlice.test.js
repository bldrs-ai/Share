import {makeFakeEditModel, translation} from '../viewer/edit/editBackend.fixture'
import {seededRandomBytes} from '../viewer/edit/edit.fixture'
import {makeEditOp} from '../viewer/edit/editOps'
import useStore from './useStore'


const WALL_GID = '3hm2qpxcLC2QR6PjoCX$Ma'
const WALL = `g${WALL_GID}`
const NOWHERE = 'g0000000000000000000000'


/**
 * Install a fake one-element model as the store's edit context.
 *
 * @return {object} the fake model (editBackend.fixture.js)
 */
function installFake() {
  const fake = makeFakeEditModel({elements: [{expressID: 771, globalId: WALL_GID, props: {Name: 'Wall'}}]})
  useStore.getState().setEditContext({backend: fake.backend, resolver: fake.resolver})
  return fake
}


let seed = 0

/**
 * @param {string} layer
 * @param {Array<number>} [offset]
 * @param {Array<string>} [targets]
 * @return {object} a transform op
 */
function move(layer, offset = [1, 0, 0], targets = [WALL]) {
  return makeEditOp({kind: 'transform', layer, targets, payload: {matrix: translation(offset)}},
    {randomBytes: seededRandomBytes(++seed)})
}


/** @return {object} the slice's derived flags, for one-line comparison */
function flags() {
  const {editCursor, isEditDirty, canUndoEdit, canRedoEdit, editLog} = useStore.getState()
  return {entries: editLog.entries.length, editCursor, isEditDirty, canUndoEdit, canRedoEdit}
}


describe('EditSlice', () => {
  beforeEach(() => {
    useStore.getState().setEditContext(null)
  })

  it('starts empty, and without a backend changes nothing', () => {
    const {applyEdit, undoEdit, redoEdit} = useStore.getState()
    expect(flags()).toEqual({entries: 0, editCursor: 0, isEditDirty: false, canUndoEdit: false, canRedoEdit: false})
    expect(applyEdit(move('document'))).toEqual({ok: false, reason: 'no edit backend'})
    expect(undoEdit()).toEqual({ok: false, reason: 'no edit backend'})
    expect(redoEdit()).toEqual({ok: false, reason: 'no edit backend'})
    expect(flags().entries).toBe(0)
  })

  it('records a document op, and undo then redo restore the scene each way', () => {
    const fake = installFake()
    const before = fake.state()
    expect(useStore.getState().applyEdit(move('document'))).toEqual({ok: true})
    const after = fake.state()
    expect(after).not.toEqual(before)
    expect(flags()).toEqual({entries: 1, editCursor: 1, isEditDirty: true, canUndoEdit: true, canRedoEdit: false})

    expect(useStore.getState().undoEdit()).toEqual({ok: true})
    expect(fake.state()).toEqual(before)
    expect(flags()).toEqual({entries: 1, editCursor: 0, isEditDirty: false, canUndoEdit: false, canRedoEdit: true})

    expect(useStore.getState().redoEdit()).toEqual({ok: true})
    expect(fake.state()).toEqual(after)
    expect(flags()).toEqual({entries: 1, editCursor: 1, isEditDirty: true, canUndoEdit: true, canRedoEdit: false})
    expect(useStore.getState().redoEdit()).toEqual({ok: false, reason: 'nothing to redo'})
  })

  it('applies a view op without dirtying or entering undo history', () => {
    const fake = installFake()
    const before = fake.state()
    expect(useStore.getState().applyEdit(move('view'))).toEqual({ok: true})
    // Applied…
    expect(fake.state()).not.toEqual(before)
    // …but not history, and not dirty.
    expect(flags()).toEqual({entries: 0, editCursor: 0, isEditDirty: false, canUndoEdit: false, canRedoEdit: false})
    expect(useStore.getState().undoEdit()).toEqual({ok: false, reason: 'nothing to undo'})
  })

  it('keeps redo available across a view op', () => {
    installFake()
    useStore.getState().applyEdit(move('document'))
    useStore.getState().undoEdit()
    useStore.getState().applyEdit(move('view', [0, 0, 1]))
    expect(flags().canRedoEdit).toBe(true)
  })

  it('captures a redo\'s undo afresh, so the next undo returns to the state at redo', () => {
    const fake = installFake()
    useStore.getState().applyEdit(move('document', [1, 0, 0]))
    useStore.getState().undoEdit()
    // A view op moves the wall while the document move is undone.
    useStore.getState().applyEdit(move('view', [0, 0, 7]))
    const atRedo = fake.state()
    useStore.getState().redoEdit()
    useStore.getState().undoEdit()
    // Back to where the redo started, view move included — not to the
    // matrix the first apply captured.
    expect(fake.state()).toEqual(atRedo)
  })

  it('truncates redo when a new document op follows an undo', () => {
    installFake()
    const first = move('document', [1, 0, 0])
    const second = move('document', [0, 1, 0])
    const third = move('document', [0, 0, 1])
    useStore.getState().applyEdit(first)
    useStore.getState().applyEdit(second)
    useStore.getState().undoEdit()
    useStore.getState().applyEdit(third)
    expect(useStore.getState().editLog.entries.map((e) => e.op.id)).toEqual([first.id, third.id])
    expect(flags().canRedoEdit).toBe(false)
  })

  it('reports an unresolved ref and records nothing', () => {
    installFake()
    const result = useStore.getState().applyEdit(move('document', [1, 0, 0], [WALL, NOWHERE]))
    expect(result.ok).toBe(false)
    expect(result.unresolved).toEqual([{ref: NOWHERE, reason: 'no element with this GlobalId in the loaded model'}])
    expect(flags().entries).toBe(0)
  })

  it('leaves the cursor where it was when an undo cannot resolve its target', () => {
    const fake = installFake()
    useStore.getState().applyEdit(move('document'))
    // A view-layer eviction of the moved element (not in history).
    useStore.getState().applyEdit(makeEditOp({kind: 'delete', layer: 'view', targets: [WALL]}))
    const result = useStore.getState().undoEdit()
    expect(result.ok).toBe(false)
    expect(result.unresolved).toEqual([{ref: WALL, reason: 'element is deleted'}])
    expect(flags().editCursor).toBe(1)
    expect(fake.state()).toEqual({})
  })

  it('is clean after a save, and a new context starts a new log', () => {
    installFake()
    useStore.getState().applyEdit(move('document'))
    useStore.getState().markEditsClean()
    expect(flags().isEditDirty).toBe(false)
    useStore.getState().undoEdit()
    expect(flags().isEditDirty).toBe(true)
    installFake()
    expect(flags()).toEqual({entries: 0, editCursor: 0, isEditDirty: false, canUndoEdit: false, canRedoEdit: false})
  })

  it('drops the log on resetEdits and keeps the context', () => {
    installFake()
    useStore.getState().applyEdit(move('document'))
    useStore.getState().resetEdits()
    expect(flags().entries).toBe(0)
    expect(useStore.getState().applyEdit(move('document'))).toEqual({ok: true})
  })
})
