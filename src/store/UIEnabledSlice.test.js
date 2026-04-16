import createStore from 'zustand/vanilla'
import createUIEnabledSlice from './UIEnabledSlice'


/** @return {object} vanilla store containing only UIEnabledSlice */
function makeStore() {
  return createStore((set, get) => createUIEnabledSlice(set, get))
}


describe('store/UIEnabledSlice', () => {
  describe('default state', () => {
    it('enables About/Login/ModelActions/Share/Google and disables Imagine', () => {
      const state = makeStore().getState()
      expect(state.isAboutEnabled).toBe(true)
      expect(state.isLoginEnabled).toBe(true)
      expect(state.isModelActionsEnabled).toBe(true)
      expect(state.isShareEnabled).toBe(true)
      expect(state.isGoogleEnabled).toBe(true)
      expect(state.isImagineEnabled).toBe(false) // service failing per comment
    })
  })


  describe('setters', () => {
    it.each([
      ['setIsAboutEnabled', 'isAboutEnabled', false],
      ['setIsImagineEnabled', 'isImagineEnabled', true],
      ['setIsLoginEnabled', 'isLoginEnabled', false],
      ['setIsModelActionsEnabled', 'isModelActionsEnabled', false],
      ['setIsShareEnabled', 'isShareEnabled', false],
    ])('%s updates %s', (setterName, key, newValue) => {
      const store = makeStore()
      store.getState()[setterName](newValue)
      expect(store.getState()[key]).toBe(newValue)
    })

    // TODO: there is no setIsGoogleEnabled — the flag is immutable at
    // runtime even though the four adjacent flags each have setters. This
    // is asymmetric; the refactor should decide whether Google gets a
    // setter or whether the others lose theirs.
    it('does not expose a setIsGoogleEnabled setter', () => {
      expect(makeStore().getState().setIsGoogleEnabled).toBeUndefined()
    })
  })
})
