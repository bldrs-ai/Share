import createStore from 'zustand/vanilla'
import createNavTreeSlice from './NavTreeSlice'


/** @return {object} vanilla store containing only NavTreeSlice */
function makeStore() {
  return createStore((set, get) => createNavTreeSlice(set, get))
}


describe('store/NavTreeSlice', () => {
  describe('default state', () => {
    it('enables the nav tree but leaves it hidden', () => {
      const state = makeStore().getState()
      expect(state.isNavTreeEnabled).toBe(true)
      expect(state.isNavTreeVisible).toBe(false)
    })

    it('seeds expansion and selection state with empty arrays / nulls', () => {
      const state = makeStore().getState()
      expect(state.defaultExpandedElements).toEqual([])
      expect(state.defaultExpandedTypes).toEqual([])
      expect(state.expandedElements).toEqual([])
      expect(state.expandedTypes).toEqual([])
      expect(state.selectedElement).toBeNull()
      expect(state.selectedElements).toEqual([])
    })
  })


  describe('visibility and enable setters', () => {
    it('setNavTreeEnabled flips the enable flag', () => {
      const store = makeStore()
      store.getState().setNavTreeEnabled(false)
      expect(store.getState().isNavTreeEnabled).toBe(false)
    })

    it('setIsNavTreeVisible sets visibility directly', () => {
      const store = makeStore()
      store.getState().setIsNavTreeVisible(true)
      expect(store.getState().isNavTreeVisible).toBe(true)
    })

    it('toggleIsNavTreeVisible flips visibility', () => {
      const store = makeStore()
      expect(store.getState().isNavTreeVisible).toBe(false)
      store.getState().toggleIsNavTreeVisible()
      expect(store.getState().isNavTreeVisible).toBe(true)
      store.getState().toggleIsNavTreeVisible()
      expect(store.getState().isNavTreeVisible).toBe(false)
    })
  })


  describe('expansion state', () => {
    it('setDefaultExpandedElements replaces the array', () => {
      const store = makeStore()
      store.getState().setDefaultExpandedElements(['1', '2', '3'])
      expect(store.getState().defaultExpandedElements).toEqual(['1', '2', '3'])
    })

    it('setDefaultExpandedTypes replaces the array', () => {
      const store = makeStore()
      store.getState().setDefaultExpandedTypes(['Wall', 'Door'])
      expect(store.getState().defaultExpandedTypes).toEqual(['Wall', 'Door'])
    })

    it('setExpandedElements replaces the array', () => {
      const store = makeStore()
      store.getState().setExpandedElements(['10', '20'])
      expect(store.getState().expandedElements).toEqual(['10', '20'])
    })

    it('setExpandedTypes replaces the array', () => {
      const store = makeStore()
      store.getState().setExpandedTypes(['IFCWALL'])
      expect(store.getState().expandedTypes).toEqual(['IFCWALL'])
    })
  })


  describe('selection', () => {
    it('setSelectedElement stores a single element', () => {
      const store = makeStore()
      const elt = {expressID: 42, type: 'IFCWALL'}
      store.getState().setSelectedElement(elt)
      expect(store.getState().selectedElement).toBe(elt)
    })

    it('setSelectedElements stores a list', () => {
      const store = makeStore()
      store.getState().setSelectedElements([1, 2, 3])
      expect(store.getState().selectedElements).toEqual([1, 2, 3])
    })

    it('setSelectedElement can clear to null', () => {
      const store = makeStore()
      store.getState().setSelectedElement({expressID: 1})
      store.getState().setSelectedElement(null)
      expect(store.getState().selectedElement).toBeNull()
    })
  })
})
