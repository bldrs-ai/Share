import createStore from 'zustand/vanilla'
import createPropertiesSlice from './PropertiesSlice'


/** @return {object} vanilla store containing only PropertiesSlice */
function makeStore() {
  return createStore((set, get) => createPropertiesSlice(set, get))
}


describe('store/PropertiesSlice', () => {
  it('enables properties by default and leaves the panel hidden', () => {
    const state = makeStore().getState()
    expect(state.isPropertiesEnabled).toBe(true)
    expect(state.isPropertiesVisible).toBe(false)
  })

  it('setIsPropertiesEnabled flips the enabled flag', () => {
    const store = makeStore()
    store.getState().setIsPropertiesEnabled(false)
    expect(store.getState().isPropertiesEnabled).toBe(false)
  })

  it('setIsPropertiesVisible sets visibility directly', () => {
    const store = makeStore()
    store.getState().setIsPropertiesVisible(true)
    expect(store.getState().isPropertiesVisible).toBe(true)
  })

  it('toggleIsPropertiesVisible flips visibility', () => {
    const store = makeStore()
    expect(store.getState().isPropertiesVisible).toBe(false)
    store.getState().toggleIsPropertiesVisible()
    expect(store.getState().isPropertiesVisible).toBe(true)
    store.getState().toggleIsPropertiesVisible()
    expect(store.getState().isPropertiesVisible).toBe(false)
  })
})
