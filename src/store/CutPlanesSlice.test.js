/* eslint-disable no-magic-numbers */
import createStore from 'zustand/vanilla'
import createCutPlanesSlice from './CutPlanesSlice'


/** @return {object} vanilla store containing only CutPlanesSlice */
function makeStore() {
  return createStore((set, get) => createCutPlanesSlice(set, get))
}


describe('store/CutPlanesSlice', () => {
  describe('default state', () => {
    it('starts with no cut planes and inactive', () => {
      const state = makeStore().getState()
      expect(state.cutPlanes).toEqual([])
      expect(state.isCutPlaneActive).toBe(false)
    })
  })


  describe('addCutPlaneDirection', () => {
    it('adds a new direction', () => {
      const store = makeStore()
      store.getState().addCutPlaneDirection({direction: 'x', offset: 1.5})
      expect(store.getState().cutPlanes).toEqual([{direction: 'x', offset: 1.5}])
    })

    it('does not add a duplicate direction', () => {
      const store = makeStore()
      store.getState().addCutPlaneDirection({direction: 'x', offset: 1.5})
      store.getState().addCutPlaneDirection({direction: 'x', offset: 9.9})
      const planes = store.getState().cutPlanes
      expect(planes.length).toBe(1)
      expect(planes[0].direction).toBe('x')
      // First-write-wins: the second call is a no-op.
      expect(planes[0].offset).toBe(1.5)
    })

    it('allows different directions to coexist', () => {
      const store = makeStore()
      store.getState().addCutPlaneDirection({direction: 'x', offset: 1})
      store.getState().addCutPlaneDirection({direction: 'y', offset: 2})
      store.getState().addCutPlaneDirection({direction: 'z', offset: 3})
      const dirs = store.getState().cutPlanes.map((p) => p.direction).sort()
      expect(dirs).toEqual(['x', 'y', 'z'])
    })
  })


  describe('removeCutPlaneDirection', () => {
    it('removes the matching direction and leaves the others', () => {
      const store = makeStore()
      store.getState().setCutPlaneDirections([
        {direction: 'x', offset: 1},
        {direction: 'y', offset: 2},
        {direction: 'z', offset: 3},
      ])
      store.getState().removeCutPlaneDirection('y')
      expect(store.getState().cutPlanes).toEqual([
        {direction: 'x', offset: 1},
        {direction: 'z', offset: 3},
      ])
    })

    it('is a no-op for a non-existent direction', () => {
      const store = makeStore()
      store.getState().setCutPlaneDirections([{direction: 'x', offset: 1}])
      store.getState().removeCutPlaneDirection('y')
      expect(store.getState().cutPlanes).toEqual([{direction: 'x', offset: 1}])
    })
  })


  describe('setCutPlaneDirections', () => {
    it('replaces the entire array', () => {
      const store = makeStore()
      store.getState().addCutPlaneDirection({direction: 'x', offset: 1})
      store.getState().setCutPlaneDirections([{direction: 'z', offset: 9}])
      expect(store.getState().cutPlanes).toEqual([{direction: 'z', offset: 9}])
    })

    it('can clear the array', () => {
      const store = makeStore()
      store.getState().addCutPlaneDirection({direction: 'x', offset: 1})
      store.getState().setCutPlaneDirections([])
      expect(store.getState().cutPlanes).toEqual([])
    })
  })


  describe('setIsCutPlaneActive', () => {
    it('toggles the active flag', () => {
      const store = makeStore()
      store.getState().setIsCutPlaneActive(true)
      expect(store.getState().isCutPlaneActive).toBe(true)
      store.getState().setIsCutPlaneActive(false)
      expect(store.getState().isCutPlaneActive).toBe(false)
    })
  })
})
