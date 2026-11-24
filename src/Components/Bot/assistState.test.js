import {
  ANON_TOKEN_KEY,
  assistAnonTokens,
  assistAuth,
  assistChat,
  assistHostedSide,
  overflowNotice,
  resetAssistChat,
} from './assistState'


describe('Bot/assistState hosted side', () => {
  afterEach(() => {
    resetAssistChat()
    assistAuth.current = {isAuthenticated: false, getAccessTokenSilently: null}
    localStorage.clear()
    jest.restoreAllMocks()
  })

  it('keeps the anonymous token across reloads, in localStorage', () => {
    assistAnonTokens.set('ba1.x.1.sig')
    expect(localStorage.getItem(ANON_TOKEN_KEY)).toBe('ba1.x.1.sig')
    expect(assistAnonTokens.get()).toBe('ba1.x.1.sig')
  })

  it('a blocked localStorage means no token, not a failed turn', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => assistAnonTokens.set('t')).not.toThrow()
    expect(assistAnonTokens.get()).toBeNull()
  })

  it('asks Auth0 for a token only when signed in, and goes anonymous when it can\'t get one', async () => {
    const getAccessTokenSilently = jest.fn(() => Promise.resolve('auth0-token'))
    assistAuth.current = {isAuthenticated: false, getAccessTokenSilently}
    expect(await assistHostedSide.getAuthToken()).toBeNull()
    expect(getAccessTokenSilently).not.toHaveBeenCalled()
    assistAuth.current = {isAuthenticated: true, getAccessTokenSilently}
    expect(await assistHostedSide.getAuthToken()).toBe('auth0-token')
    getAccessTokenSilently.mockImplementation(() => Promise.reject(new Error('login_required')))
    expect(await assistHostedSide.getAuthToken()).toBeNull()
  })

  it('shows the overflow notice once per chat, worded by tier', () => {
    assistHostedSide.onMeta({tier: 'anonymous', used: 0, limit: 1, overflow: false})
    expect(assistChat.get().messages).toEqual([])
    assistHostedSide.onMeta({tier: 'anonymous', used: 0, limit: 1, overflow: true})
    assistHostedSide.onMeta({tier: 'anonymous', used: 0, limit: 1, overflow: true})
    expect(assistChat.get().messages.map((m) => [m.kind, m.text])).toEqual([['notice', overflowNotice('anonymous')]])
    expect(overflowNotice('anonymous')).toMatch(/Sign in/)
    expect(overflowNotice('free')).toMatch(/Upgrade to Pro/)
  })
})
