// IfcHighlighter is mostly a thin wrapper around postprocessing's
// OutlineEffect — its `addToHighlighting` / `removeFromHighlighting`
// just poke at the OutlineEffect's `Selection` collection (a custom
// type that exposes `indexOf`, `add`, `delete`). These tests exercise
// the poke layer without instantiating the full effect-composer
// pipeline. Construction (which wires up renderer + postprocessor)
// is exercised by the existing ShareViewer raycast-routing test.

import IfcHighlighter from './IfcHighlighter'


/**
 * Build a bare highlighter wired to a fake OutlineEffect selection.
 *
 * @return {{highlighter: IfcHighlighter, selection: object}}
 */
function makeHighlighterWithMockSelection() {
  const selection = {
    _items: [],
    indexOf(m) {
      return this._items.indexOf(m)
    },
    add(m) {
      this._items.push(m)
    },
    delete(m) {
      const i = this._items.indexOf(m)
      if (i !== -1) {
        this._items.splice(i, 1)
      }
    },
  }
  const outlineEffect = {
    getSelection: () => selection,
    setSelection: jest.fn((meshes) => {
      selection._items = [...meshes]
    }),
  }
  const highlighter = Object.create(IfcHighlighter.prototype)
  highlighter._selectionOutlineEffect = outlineEffect
  return {highlighter, selection}
}


describe('viewer/three/IfcHighlighter', () => {
  describe('addToHighlighting', () => {
    it('adds a mesh to the OutlineEffect selection', () => {
      const {highlighter, selection} = makeHighlighterWithMockSelection()
      const mesh = {}
      highlighter.addToHighlighting(mesh)
      expect(selection._items).toContain(mesh)
    })

    it('de-duplicates: a second add of the same mesh is a no-op', () => {
      const {highlighter, selection} = makeHighlighterWithMockSelection()
      const mesh = {}
      highlighter.addToHighlighting(mesh)
      highlighter.addToHighlighting(mesh)
      expect(selection._items.length).toBe(1)
    })

    it('null / undefined mesh is a no-op', () => {
      const {highlighter, selection} = makeHighlighterWithMockSelection()
      highlighter.addToHighlighting(null)
      highlighter.addToHighlighting(undefined)
      expect(selection._items.length).toBe(0)
    })
  })


  describe('removeFromHighlighting', () => {
    it('removes a previously-added mesh', () => {
      const {highlighter, selection} = makeHighlighterWithMockSelection()
      const a = {tag: 'a'}
      const b = {tag: 'b'}
      highlighter.addToHighlighting(a)
      highlighter.addToHighlighting(b)
      highlighter.removeFromHighlighting(a)
      expect(selection._items).toEqual([b])
    })

    it('removing a never-added mesh is a no-op', () => {
      const {highlighter, selection} = makeHighlighterWithMockSelection()
      const a = {}
      highlighter.addToHighlighting(a)
      const stranger = {}
      highlighter.removeFromHighlighting(stranger)
      expect(selection._items).toEqual([a])
    })

    it('null / undefined mesh is a no-op', () => {
      const {highlighter, selection} = makeHighlighterWithMockSelection()
      const a = {}
      highlighter.addToHighlighting(a)
      highlighter.removeFromHighlighting(null)
      highlighter.removeFromHighlighting(undefined)
      expect(selection._items).toEqual([a])
    })

    it('lets the same mesh be re-added after removal (the Conway-direct hover loop)', () => {
      // The motivating use case: hover preselection — fresh subset
      // Mesh built every mouse-move, previous one needs pruning
      // before the new one is added so the OutlineEffect's selection
      // set stays bounded across hovers.
      const {highlighter, selection} = makeHighlighterWithMockSelection()
      const a = {tag: 'a'}
      highlighter.addToHighlighting(a)
      highlighter.removeFromHighlighting(a)
      highlighter.addToHighlighting(a)
      expect(selection._items).toEqual([a])
    })
  })
})
