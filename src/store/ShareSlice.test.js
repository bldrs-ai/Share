import createStore from 'zustand/vanilla'
import createShareSlice from './ShareSlice'


/** @return {object} vanilla store containing only ShareSlice */
function makeStore() {
  return createStore((set, get) => createShareSlice(set, get))
}


describe('store/ShareSlice', () => {
  it('appPrefix is null by default', () => {
    expect(makeStore().getState().appPrefix).toBeNull()
  })

  it('setAppPrefix stores the prefix', () => {
    const store = makeStore()
    store.getState().setAppPrefix('/share')
    expect(store.getState().appPrefix).toBe('/share')
  })

  it('setAppPrefix can overwrite a previous value', () => {
    const store = makeStore()
    store.getState().setAppPrefix('/share')
    store.getState().setAppPrefix('/v/gh')
    expect(store.getState().appPrefix).toBe('/v/gh')
  })

  it('setAppPrefix can reset to null', () => {
    const store = makeStore()
    store.getState().setAppPrefix('/share')
    store.getState().setAppPrefix(null)
    expect(store.getState().appPrefix).toBeNull()
  })
})
