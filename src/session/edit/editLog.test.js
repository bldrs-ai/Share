import {
  EMPTY_EDIT_LOG,
  appliedOps,
  canRedo,
  canUndo,
  entryToRedo,
  entryToUndo,
  isDirty,
  markClean,
  recordApplied,
  stepBack,
  stepForward,
} from './editLog'


/**
 * @param {string} id
 * @param {string} [layer]
 * @return {object} a delete op; the log never looks inside one but its layer
 */
function op(id, layer = 'document') {
  return {id, kind: 'delete', targets: ['g3hm2qpxcLC2QR6PjoCX$Ma'], payload: {}, layer}
}


/**
 * @param {Array<object>} ops
 * @return {object} a log with each op recorded in order
 */
function logOf(ops) {
  return ops.reduce((log, o) => recordApplied(log, o, {undoOf: o.id}), EMPTY_EDIT_LOG)
}


describe('session/edit/editLog', () => {
  it('starts clean, with nothing to undo or redo', () => {
    expect(canUndo(EMPTY_EDIT_LOG)).toBe(false)
    expect(canRedo(EMPTY_EDIT_LOG)).toBe(false)
    expect(isDirty(EMPTY_EDIT_LOG)).toBe(false)
    expect(entryToUndo(EMPTY_EDIT_LOG)).toBeNull()
    expect(entryToRedo(EMPTY_EDIT_LOG)).toBeNull()
  })

  it('records a document op: undoable and dirty', () => {
    const log = logOf([op('a')])
    expect(log.cursor).toBe(1)
    expect(canUndo(log)).toBe(true)
    expect(isDirty(log)).toBe(true)
    expect(entryToUndo(log)).toEqual({op: op('a'), undo: {undoOf: 'a'}})
  })

  it('leaves the log untouched for a view op', () => {
    const log = logOf([op('a')])
    expect(recordApplied(log, op('evict', 'view'), null)).toBe(log)
    expect(recordApplied(EMPTY_EDIT_LOG, op('evict', 'view'), null)).toBe(EMPTY_EDIT_LOG)
  })

  it('undoes and redoes by moving one cursor over one list', () => {
    const log = logOf([op('a'), op('b')])
    const back = stepBack(log)
    expect(back.cursor).toBe(1)
    expect(back.entries).toBe(log.entries)
    expect(entryToRedo(back).op.id).toBe('b')
    expect(entryToUndo(back).op.id).toBe('a')
    const forward = stepForward(back, {undoOf: 'b, again'})
    expect(forward.cursor).toBe(2)
    expect(forward.entries[1].undo).toEqual({undoOf: 'b, again'})
    expect(() => stepBack(stepBack(back))).toThrow(RangeError)
    expect(() => stepForward(log, null)).toThrow(RangeError)
  })

  it('truncates the redo tail when a new op follows an undo', () => {
    const log = stepBack(stepBack(logOf([op('a'), op('b'), op('c')])))
    const next = recordApplied(log, op('d'), null)
    expect(next.entries.map((e) => e.op.id)).toEqual(['a', 'd'])
    expect(canRedo(next)).toBe(false)
  })

  it('keeps the redo tail across a view op', () => {
    const log = stepBack(logOf([op('a'), op('b')]))
    const next = recordApplied(log, op('evict', 'view'), null)
    expect(canRedo(next)).toBe(true)
    expect(entryToRedo(next).op.id).toBe('b')
  })

  it('is clean again when undone back to the saved point', () => {
    const saved = markClean(logOf([op('a')]))
    expect(isDirty(saved)).toBe(false)
    const edited = recordApplied(saved, op('b'), null)
    expect(isDirty(edited)).toBe(true)
    expect(isDirty(stepBack(edited))).toBe(false)
    expect(isDirty(stepBack(stepBack(edited)))).toBe(true)
  })

  it('stays dirty for good once the saved point is truncated away', () => {
    // Save at 2, undo to 1, record: the saved state is no longer reachable.
    const log = recordApplied(stepBack(markClean(logOf([op('a'), op('b')]))), op('c'), null)
    expect(log.cursor).toBe(2)
    expect(isDirty(log)).toBe(true)
    expect(isDirty(stepBack(log))).toBe(true)
  })

  it('refuses to record an op that does not validate, whoever made it', () => {
    const bad = {...op('a'), payload: {batchId: 7}}
    expect(() => recordApplied(EMPTY_EDIT_LOG, bad, null)).toThrow(/batchId/)
  })

  it('records a copy, so a caller mutating its op afterwards cannot change the log', () => {
    const mine = op('a')
    const log = recordApplied(EMPTY_EDIT_LOG, mine, null)
    mine.payload.batchId = 7
    expect(appliedOps(log)).toEqual([op('a')])
  })

  it('hands persistence the applied ops only: no undo records, no redo tail', () => {
    const log = stepBack(logOf([op('a'), op('b')]))
    expect(appliedOps(log)).toEqual([op('a')])
    expect(JSON.stringify(appliedOps(log))).not.toMatch(/undoOf/)
  })
})
