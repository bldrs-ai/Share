import {elementSelection} from './selection'


describe('elementSelection', () => {
  // A tiny spatial tree: 1 ⊃ 2 ⊃ 3.
  const leaf = {expressID: 3, children: []}
  const mid = {expressID: 2, children: [leaf]}
  const root = {expressID: 1, children: [mid]}
  const elementsById = {1: root, 2: mid, 3: leaf}

  /**
   * Minimal viewer stub for the isolator + scene-selection surface
   * elementSelection reads.
   *
   * @param {Array<number>} selectedIds currently selected in the scene
   * @param {boolean} pickable whether canBePickedInScene returns true
   * @return {object} viewer stub
   */
  function makeViewer(selectedIds = [], pickable = true) {
    return {
      isolator: {canBePickedInScene: jest.fn(() => pickable)},
      getSelectedIds: jest.fn(() => [...selectedIds]),
    }
  }

  it('selects a leaf element and updates navigation (non-shift)', () => {
    const viewer = makeViewer()
    const selectItemsInScene = jest.fn()
    elementSelection(viewer, elementsById, selectItemsInScene, false, 3)
    expect(selectItemsInScene).toHaveBeenCalledWith([3], true)
  })

  it('selects an element together with its descendants (non-shift)', () => {
    const viewer = makeViewer()
    const selectItemsInScene = jest.fn()
    elementSelection(viewer, elementsById, selectItemsInScene, false, 2)
    const [ids, updateNav] = selectItemsInScene.mock.calls[0]
    expect(new Set(ids)).toEqual(new Set([2, 3]))
    expect(updateNav).toBe(true)
  })

  // Regression: NavTree click handlers pass `node.expressID.toString()`
  // (a string) while scene picks pass a numeric `mesh.expressID`. A
  // string id must behave identically to the numeric one. Pre-fix the
  // shift toggle did `Set<number>.has("2")` — always false — so
  // shift-clicking an already-selected tree node RE-ADDED it instead of
  // removing it. With the Number() normalisation the toggle deselects.
  it('shift-clicking an already-selected element removes it — string id from NavTree', () => {
    const viewer = makeViewer([2]) // 2 already selected in the scene
    const selectItemsInScene = jest.fn()
    elementSelection(viewer, elementsById, selectItemsInScene, true, '2')
    expect(selectItemsInScene).toHaveBeenCalledWith([], false)
  })

  it('shift-clicking an unselected element adds it without updating navigation — string id', () => {
    const viewer = makeViewer([])
    const selectItemsInScene = jest.fn()
    elementSelection(viewer, elementsById, selectItemsInScene, true, '3')
    expect(selectItemsInScene).toHaveBeenCalledWith([3], false)
  })

  it('does nothing when the element cannot be picked in the scene', () => {
    const viewer = makeViewer([], false)
    const selectItemsInScene = jest.fn()
    elementSelection(viewer, elementsById, selectItemsInScene, false, 2)
    expect(selectItemsInScene).not.toHaveBeenCalled()
  })

  it('does nothing for a non-numeric id, without touching the isolator', () => {
    const viewer = makeViewer()
    const selectItemsInScene = jest.fn()
    elementSelection(viewer, elementsById, selectItemsInScene, false, undefined)
    expect(selectItemsInScene).not.toHaveBeenCalled()
    expect(viewer.isolator.canBePickedInScene).not.toHaveBeenCalled()
  })
})
