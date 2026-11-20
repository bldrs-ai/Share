import {
  ASSIST_SESSION_KEY_PREFIX,
  assistScope,
  assistSessionKey,
  assistStorageKeys,
  isAssistLogKey,
} from './assistSessionKey'


describe('Bot/assistSessionKey', () => {
  const route = 'https://bldrs.ai/index.ifc'

  it('is stable for the same inputs, and differs by model and by scope', () => {
    const key = assistSessionKey({modelRoute: route, scope: 'anonymous'})
    expect(key).toBe(assistSessionKey({modelRoute: route, scope: 'anonymous'}))
    expect(key.startsWith(ASSIST_SESSION_KEY_PREFIX)).toBe(true)
    expect(assistSessionKey({modelRoute: 'https://bldrs.ai/other.ifc', scope: 'anonymous'})).not.toBe(key)
    expect(assistSessionKey({modelRoute: route, scope: 'user-1234abcd'})).not.toBe(key)
  })

  it('encodes its inputs, so no two different inputs build one key', () => {
    const a = assistSessionKey({modelRoute: 'x|y', scope: 'anonymous'})
    const b = assistSessionKey({modelRoute: 'y', scope: 'anonymous|x'})
    expect(a).not.toBe(b)
    expect(isAssistLogKey(a)).toBe(true)
    expect(isAssistLogKey(b)).toBe(true)
  })

  it.each([
    [{scope: 'anonymous'}],
    [{modelRoute: '', scope: 'anonymous'}],
    [{modelRoute: route}],
    [{modelRoute: route, scope: null}],
  ])('refuses missing inputs: %j', (inputs) => {
    expect(() => assistSessionKey(inputs)).toThrow(TypeError)
  })

  it('derives the lock name from the key, and tells logs apart from other keys', () => {
    const key = assistSessionKey({modelRoute: route, scope: 'anonymous'})
    const {log, lock} = assistStorageKeys(key)
    expect(log).toBe(key)
    expect(lock).not.toBe(log)
    expect(lock.startsWith(key)).toBe(true)
    expect(isAssistLogKey(log)).toBe(true)
    expect(isAssistLogKey(lock)).toBe(false)
    expect(isAssistLogKey('bldrs.assist.anonToken')).toBe(false)
  })

  it('scopes by sign-in, hashing the user id rather than storing it', () => {
    expect(assistScope({isAuthenticated: false, userSub: 'github|1'})).toBe('anonymous')
    const one = assistScope({isAuthenticated: true, userSub: 'github|1'})
    expect(one).toMatch(/^user-[0-9a-f]{8}$/)
    expect(one).not.toContain('github')
    expect(assistScope({isAuthenticated: true, userSub: 'github|2'})).not.toBe(one)
    expect(assistScope({isAuthenticated: true, userSub: 'github|1'})).toBe(one)
  })
})
