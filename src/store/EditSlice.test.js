import {makeFakeEditModel, translation} from '../viewer/edit/editBackend.fixture'
import {seededRandomBytes} from '../viewer/edit/edit.fixture'
import {applyEditOp, EditInconsistentError} from '../viewer/edit/editApply'
import {EMPTY_EDIT_LOG, appliedOps, recordApplied} from '../viewer/edit/editLog'
import {makeEditOp} from '../viewer/edit/editOps'
import useStore from './useStore'


const WALL_GID = '3hm2qpxcLC2QR6PjoCX$Ma'
const WALL = `g${WALL_GID}`
const DOOR_GID = '1Bd8Kc$Pr2ExS0vV8q9Zz0'
const DOOR = `g${DOOR_GID}`
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
    // setEditContext(null) alone keeps the log and any inconsistency (the
    // same-backend rule), so a fresh model is installed first to reset both.
    const blank = makeFakeEditModel()
    useStore.getState().setEditContext({backend: blank.backend, resolver: blank.resolver})
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


  /** @return {object} a fake with a wall and a door, installed */
  function installPair() {
    const fake = makeFakeEditModel({elements: [
      {expressID: 771, globalId: WALL_GID},
      {expressID: 812, globalId: DOOR_GID},
    ]})
    useStore.getState().setEditContext({backend: fake.backend, resolver: fake.resolver})
    return fake
  }


  /**
   * Make one backend method, on its `n`th call from now, do its work and
   * THEN throw, once.
   *
   * @param {object} backend
   * @param {string} method
   * @param {number} n
   */
  function mutateThenThrow(backend, method, n) {
    const original = backend[method]
    let count = 0
    backend[method] = (...args) => {
      const result = original(...args)
      if (++count === n) {
        throw new Error(`${method} failed after mutating`)
      }
      return result
    }
  }


  /**
   * @param {Function} fn
   * @return {Error} what `fn` threw
   */
  function thrown(fn) {
    try {
      fn()
    } catch (error) {
      return error
    }
    throw new Error('expected a throw')
  }


  const refused = {ok: false, reason: expect.stringMatching(/inconsistent/)}


  /**
   * Every action refuses, view ops included, and the cursor stays put.
   *
   * @param {number} cursor where it must still be
   */
  function expectStopped(cursor) {
    const {applyEdit, undoEdit, redoEdit} = useStore.getState()
    expect(applyEdit(move('document'))).toEqual(refused)
    expect(applyEdit(move('view'))).toEqual(refused)
    expect(undoEdit()).toEqual(refused)
    expect(redoEdit()).toEqual(refused)
    expect(flags().editCursor).toBe(cursor)
  }


  const bothUp = () => move('document', [0, 2, 0], [WALL, DOOR])

  // [direction, arrange(fake) → the action that will throw]
  const FAILURES = [
    ['apply', (fake) => {
      mutateThenThrow(fake.backend, 'transform', 2)
      return () => useStore.getState().applyEdit(bothUp())
    }],
    ['undo', (fake) => {
      useStore.getState().applyEdit(bothUp())
      mutateThenThrow(fake.backend, 'setMatrix', 2)
      return () => useStore.getState().undoEdit()
    }],
    ['redo', (fake) => {
      useStore.getState().applyEdit(bothUp())
      useStore.getState().undoEdit()
      mutateThenThrow(fake.backend, 'transform', 2)
      return () => useStore.getState().redoEdit()
    }],
  ]

  it.each(FAILURES)('%s: a backend step that mutates and then throws stops the log', (direction, arrange) => {
    const fake = installPair()
    const act = arrange(fake)
    const cursor = flags().editCursor
    const error = thrown(act)
    expect(error).toBeInstanceOf(EditInconsistentError)
    expect(error.cause.message).toMatch(/failed after mutating$/)
    expect(error.direction).toBe(direction)
    expect(useStore.getState().isEditInconsistent).toBe(true)
    expect(useStore.getState().editInconsistency).toBe(error)
    expectStopped(cursor)
  })


  /**
   * Apply a two-element delete, then fail its undo part way.
   *
   * @return {object} the installed fake
   */
  function stopTheLog() {
    const fake = installPair()
    useStore.getState().applyEdit(makeEditOp({kind: 'delete', layer: 'document', targets: [WALL, DOOR]}))
    mutateThenThrow(fake.backend, 'restore', 2)
    expect(() => useStore.getState().undoEdit()).toThrow(EditInconsistentError)
    return fake
  }


  it('keeps an inconsistency, and the log, when the same backend is reinstalled', () => {
    const fake = stopTheLog()
    const log = useStore.getState().editLog
    const {setEditContext} = useStore.getState()
    setEditContext({backend: fake.backend, resolver: fake.resolver})
    expect(useStore.getState().isEditInconsistent).toBe(true)
    expect(useStore.getState().editLog).toBe(log)
    setEditContext(null)
    setEditContext({backend: fake.backend, resolver: fake.resolver})
    expect(useStore.getState().isEditInconsistent).toBe(true)
    expect(useStore.getState().editLog).toBe(log)
    expectStopped(1)
  })


  it('keeps a consistent log when the same backend is reinstalled', () => {
    const fake = installFake()
    useStore.getState().applyEdit(move('document'))
    useStore.getState().setEditContext(null)
    useStore.getState().setEditContext({backend: fake.backend, resolver: fake.resolver})
    expect(flags()).toEqual({entries: 1, editCursor: 1, isEditDirty: true, canUndoEdit: true, canRedoEdit: false})
  })


  it('clears an inconsistent log when a different model is installed', () => {
    stopTheLog()
    installFake()
    expect(useStore.getState().isEditInconsistent).toBe(false)
    expect(flags().entries).toBe(0)
    expect(useStore.getState().applyEdit(move('document'))).toEqual({ok: true})
  })


  it('refuses recovery with the backend that failed', () => {
    const fake = stopTheLog()
    const result = useStore.getState().markEditsRecovered(
      {backend: fake.backend, resolver: fake.resolver}, useStore.getState().editLog)
    expect(result).toEqual({ok: false, reason: expect.stringMatching(/rebuilt scene/)})
    expect(useStore.getState().isEditInconsistent).toBe(true)
    expectStopped(1)
  })


  it('refuses recovery when nothing is inconsistent', () => {
    installFake()
    const rebuilt = makeFakeEditModel()
    expect(useStore.getState().markEditsRecovered({backend: rebuilt.backend, resolver: rebuilt.resolver},
      EMPTY_EDIT_LOG)).toEqual({ok: false, reason: expect.stringMatching(/not inconsistent/)})
  })


  it('recovers once the scene is rebuilt from source and the applied ops replayed', () => {
    stopTheLog()
    const ops = appliedOps(useStore.getState().editLog)
    // L3's job, done by hand: a fresh backend over the source, then replay.
    const rebuilt = makeFakeEditModel({elements: [
      {expressID: 771, globalId: WALL_GID},
      {expressID: 812, globalId: DOOR_GID},
    ]})
    const context = {backend: rebuilt.backend, resolver: rebuilt.resolver}
    const before = rebuilt.state()
    let log = EMPTY_EDIT_LOG
    for (const op of ops) {
      const result = applyEditOp(op, context)
      log = recordApplied(log, result.op, result.undo)
    }
    expect(useStore.getState().markEditsRecovered(context, log)).toEqual({ok: true})
    expect(useStore.getState().isEditInconsistent).toBe(false)
    expect(flags()).toEqual({entries: 1, editCursor: 1, isEditDirty: true, canUndoEdit: true, canRedoEdit: false})
    expect(useStore.getState().undoEdit()).toEqual({ok: true})
    expect(rebuilt.state()).toEqual(before)
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

  it('refuses an unresolved ref cleanly: nothing applied, nothing recorded, the log still consistent', () => {
    const fake = installPair()
    const before = fake.state()
    const result = useStore.getState().applyEdit(move('document', [1, 0, 0], [WALL, DOOR, NOWHERE]))
    expect(result).toEqual({
      ok: false,
      reason: 'unresolved refs; nothing was changed',
      unresolved: [{ref: NOWHERE, reason: 'no element with this GlobalId in the loaded model'}],
    })
    expect(fake.state()).toEqual(before)
    expect(fake.calls).toEqual([])
    expect(flags().entries).toBe(0)
    expect(useStore.getState().isEditInconsistent).toBe(false)
    expect(useStore.getState().applyEdit(move('document'))).toEqual({ok: true})
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

  it('keeps per-load ids out of the log when a caller builds an op literal', () => {
    installFake()
    const literal = {id: 'op1', kind: 'delete', targets: [WALL], payload: {batchId: 7}, layer: 'document'}
    const result = useStore.getState().applyEdit(literal)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/batchId/)
    expect(appliedOps(useStore.getState().editLog)).toEqual([])
  })

  it('records the very object it applied, not the caller\'s literal', () => {
    const fake = installFake()
    let seen
    const create = fake.backend.create
    fake.backend.create = (ref, payload) => {
      seen = payload
      create(ref, payload)
    }
    const literal = {id: 'op1', kind: 'create', targets: ['g2Bd8Kc$Pr2ExS0vV8q9Zz0'], layer: 'document',
      payload: {geometry: {box: [1, 1, 1]}}}
    expect(useStore.getState().applyEdit(literal)).toEqual({ok: true})
    const [recorded] = appliedOps(useStore.getState().editLog)
    expect(recorded).toEqual(literal)
    expect(seen).toBe(recorded.payload)
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
