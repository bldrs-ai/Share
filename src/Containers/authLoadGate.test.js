import {HTTP_AUTHORIZATION_REQUIRED, HTTP_FORBIDDEN, HTTP_NOT_FOUND, HTTP_INTERNAL_SERVER_ERROR} from '../net/http'
import useStore from '../store/useStore'
import {isAuthShapedLoadError, waitForAuthSettled} from './authLoadGate'


// Comfortably longer than the store flip below — the waiter should resolve
// on the flip, not the timer.
const NEVER_EXPIRES_MS = 5000


describe('authLoadGate', () => {
  describe('waitForAuthSettled', () => {
    beforeEach(() => {
      useStore.setState({isAuthResolved: false})
    })

    it('resolves true immediately when auth is already settled', async () => {
      useStore.setState({isAuthResolved: true})
      await expect(waitForAuthSettled(0)).resolves.toBe(true)
    })

    it('resolves true when auth settles within the window', async () => {
      const settled = waitForAuthSettled(NEVER_EXPIRES_MS)
      useStore.setState({isAuthResolved: true})
      await expect(settled).resolves.toBe(true)
    })

    it('resolves false when the window expires first', async () => {
      await expect(waitForAuthSettled(10)).resolves.toBe(false)
    })

    it('a timed-out waiter leaves no dangling subscription behind', async () => {
      await waitForAuthSettled(10)
      // Flipping the flag after timeout must not throw or double-resolve —
      // the subscription was cleaned up on timeout.
      useStore.setState({isAuthResolved: true})
      await expect(waitForAuthSettled(0)).resolves.toBe(true)
    })
  })

  describe('isAuthShapedLoadError', () => {
    it.each([
      HTTP_AUTHORIZATION_REQUIRED,
      HTTP_FORBIDDEN,
      HTTP_NOT_FOUND,
    ])('matches octokit-style errors with status %i', (status) => {
      const err = new Error('boom')
      err.status = status
      expect(isAuthShapedLoadError(err)).toBe(true)
    })

    it.each([
      ['a 500', Object.assign(new Error('server'), {status: HTTP_INTERNAL_SERVER_ERROR})],
      ['a plain Error', new Error('no status')],
      ['undefined', undefined],
      ['null', null],
    ])('does not match %s', (_label, err) => {
      expect(isAuthShapedLoadError(err)).toBe(false)
    })
  })
})
