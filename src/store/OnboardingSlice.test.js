import createStore from 'zustand/vanilla'
import createOnboardingSlice from './OnboardingSlice'


/** @return {object} vanilla store containing only OnboardingSlice */
function makeStore() {
  return createStore((set, get) => createOnboardingSlice(set, get))
}


describe('store/OnboardingSlice', () => {
  it('starts with the overlay hidden and no source', () => {
    const state = makeStore().getState()
    expect(state.isOnboardingOverlayVisible).toBe(false)
    expect(state.onboardingOverlaySource).toBeNull()
  })

  it('setIsOnboardingOverlayVisible updates visibility and source together', () => {
    const store = makeStore()
    store.getState().setIsOnboardingOverlayVisible(true, 'help')
    expect(store.getState().isOnboardingOverlayVisible).toBe(true)
    expect(store.getState().onboardingOverlaySource).toBe('help')
  })

  it('accepts an about source as well as help', () => {
    const store = makeStore()
    store.getState().setIsOnboardingOverlayVisible(true, 'about')
    expect(store.getState().onboardingOverlaySource).toBe('about')
  })

  it('defaults the source to null when only the visibility is provided', () => {
    const store = makeStore()
    store.getState().setIsOnboardingOverlayVisible(true, 'help')
    store.getState().setIsOnboardingOverlayVisible(false)
    expect(store.getState().isOnboardingOverlayVisible).toBe(false)
    expect(store.getState().onboardingOverlaySource).toBeNull()
  })
})
