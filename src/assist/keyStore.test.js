import {OPENROUTER_KEY_ID, createSessionKeyStore} from './keyStore'


describe('assist/keyStore', () => {
  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('holds a trimmed key in memory only, and forgets it', () => {
    const store = createSessionKeyStore()
    const changes = jest.fn()
    const unsubscribe = store.subscribe(changes)
    expect(store.get(OPENROUTER_KEY_ID)).toBe(null)
    store.set(OPENROUTER_KEY_ID, '  sk-or-1  ')
    expect(store.get(OPENROUTER_KEY_ID)).toBe('sk-or-1')
    // Session-only (#1675): nothing reaches web storage.
    expect(JSON.stringify({...localStorage})).not.toContain('sk-or-1')
    expect(JSON.stringify({...sessionStorage})).not.toContain('sk-or-1')
    store.set(OPENROUTER_KEY_ID, ' ')
    expect(store.get(OPENROUTER_KEY_ID)).toBe(null)
    store.set(OPENROUTER_KEY_ID, 'sk-or-2')
    store.forget(OPENROUTER_KEY_ID)
    expect(store.get(OPENROUTER_KEY_ID)).toBe(null)
    expect(changes).toHaveBeenCalledTimes(4)
    unsubscribe()
    store.set(OPENROUTER_KEY_ID, 'sk-or-3')
    expect(changes).toHaveBeenCalledTimes(4)
  })

  it('a new store starts empty: nothing outlives the tab', () => {
    createSessionKeyStore().set(OPENROUTER_KEY_ID, 'sk-or-1')
    expect(createSessionKeyStore().get(OPENROUTER_KEY_ID)).toBe(null)
  })
})
