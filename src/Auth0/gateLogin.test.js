/* eslint-disable no-magic-numbers */
import {GATE_LOGIN_TTL_MS, clearGateLogin, noteGateLogin, takeGateLoginSource} from './gateLogin'


describe('Auth0/gateLogin', () => {
  beforeEach(() => clearGateLogin())

  it('gives the gate and feature once, to the sign-in that follows', () => {
    noteGateLogin('export', 1000)
    expect(takeGateLoginSource(2000)).toEqual({from: 'gate', feature: 'export'})
    // Consumed: a second sign-in is not the gate's.
    expect(takeGateLoginSource(3000)).toEqual({})
  })

  it('is empty when no gate started a sign-in', () => {
    expect(takeGateLoginSource()).toEqual({})
  })

  it('is empty after the login dialog was dismissed', () => {
    noteGateLogin('share')
    clearGateLogin()
    expect(takeGateLoginSource()).toEqual({})
  })

  // A popup abandoned at a gate must not label a sign-in made later from the
  // Profile menu.
  it('expires after GATE_LOGIN_TTL_MS', () => {
    noteGateLogin('export', 0)
    expect(takeGateLoginSource(GATE_LOGIN_TTL_MS + 1)).toEqual({})
    noteGateLogin('export', 0)
    expect(takeGateLoginSource(GATE_LOGIN_TTL_MS)).toEqual({from: 'gate', feature: 'export'})
  })
})
