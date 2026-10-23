/* eslint-disable no-magic-numbers */
import {
  GATE_LOGIN_KEY,
  GATE_LOGIN_TTL_MS,
  GATE_RETURN_EXPORT,
  clearGateLogin,
  noteGateLogin,
  takeGateLoginReturn,
  takeGateLoginSource,
} from './gateLogin'


describe('Auth0/gateLogin', () => {
  beforeEach(() => {
    clearGateLogin()
    localStorage.clear()
  })

  afterEach(() => jest.restoreAllMocks())

  it('gives the gate and feature once, to the sign-in that follows', () => {
    noteGateLogin('export', null, 1000)
    expect(takeGateLoginSource(2000)).toEqual({from: 'gate', feature: 'export'})
    // Consumed: a second sign-in is not the gate's.
    expect(takeGateLoginSource(3000)).toEqual({})
  })

  it('is empty when no gate started a sign-in', () => {
    expect(takeGateLoginSource()).toEqual({})
    expect(takeGateLoginReturn()).toBeNull()
  })

  it('is empty after the attempt was cleared (dismissal, or a non-gate sign-in)', () => {
    noteGateLogin('share', GATE_RETURN_EXPORT)
    clearGateLogin()
    expect(takeGateLoginSource()).toEqual({})
    expect(takeGateLoginReturn()).toBeNull()
  })

  // A popup abandoned at a gate must not label, or reopen Save for, a
  // sign-in made later.
  it('expires both parts after GATE_LOGIN_TTL_MS', () => {
    noteGateLogin('export', GATE_RETURN_EXPORT, 0)
    expect(takeGateLoginSource(GATE_LOGIN_TTL_MS + 1)).toEqual({})
    expect(takeGateLoginReturn(GATE_LOGIN_TTL_MS + 1)).toBeNull()
    noteGateLogin('export', GATE_RETURN_EXPORT, 0)
    expect(takeGateLoginSource(GATE_LOGIN_TTL_MS)).toEqual({from: 'gate', feature: 'export'})
    expect(takeGateLoginReturn(GATE_LOGIN_TTL_MS)).toBe(GATE_RETURN_EXPORT)
  })

  it('consumes the attribution and the return independently, in either order', () => {
    noteGateLogin('export', GATE_RETURN_EXPORT)
    expect(takeGateLoginReturn()).toBe(GATE_RETURN_EXPORT)
    expect(takeGateLoginSource()).toEqual({from: 'gate', feature: 'export'})
    expect(localStorage.getItem(GATE_LOGIN_KEY)).toBeNull()
  })

  // The attribution goes to whichever tab sends `login`, so it is readable
  // from any tab; the return is only this page's.
  it('shares the attribution across tabs, but honours only its own return', () => {
    localStorage.setItem(GATE_LOGIN_KEY, JSON.stringify({
      feature: 'export', returnTo: GATE_RETURN_EXPORT, attemptId: 'another-tab', at: Date.now(),
    }))
    expect(takeGateLoginReturn()).toBeNull()
    expect(takeGateLoginSource()).toEqual({from: 'gate', feature: 'export'})
  })

  it('fails closed when storage is unavailable', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => noteGateLogin('export', GATE_RETURN_EXPORT)).not.toThrow()
    expect(takeGateLoginSource()).toEqual({})
    expect(takeGateLoginReturn()).toBeNull()
  })
})
