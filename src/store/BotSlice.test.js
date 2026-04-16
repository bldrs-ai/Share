import createStore from 'zustand/vanilla'
import createBotSlice from './BotSlice'


/** @return {object} vanilla store containing only BotSlice */
function makeStore() {
  return createStore((set, get) => createBotSlice(set, get))
}


describe('store/BotSlice', () => {
  it('starts hidden when no hash is present', () => {
    expect(makeStore().getState().isBotVisible).toBe(false)
  })

  it('setIsBotVisible sets visibility directly', () => {
    const store = makeStore()
    store.getState().setIsBotVisible(true)
    expect(store.getState().isBotVisible).toBe(true)
  })

  it('toggleIsBotVisible flips visibility', () => {
    const store = makeStore()
    expect(store.getState().isBotVisible).toBe(false)
    store.getState().toggleIsBotVisible()
    expect(store.getState().isBotVisible).toBe(true)
    store.getState().toggleIsBotVisible()
    expect(store.getState().isBotVisible).toBe(false)
  })
})
