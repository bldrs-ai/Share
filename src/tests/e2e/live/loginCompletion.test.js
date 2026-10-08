import {CLOSE_GRACE_MS, isCallbackUrl, loginCompletion} from './loginCompletion'


/* eslint-disable no-magic-numbers */
const T0 = 1_000_000
const base = {reachedCallback: false, closedAtMs: null, hasSession: null, nowMs: T0, deadlinePassed: false}


describe('live/loginCompletion', () => {
  describe('isCallbackUrl', () => {
    const target = 'https://deploy-preview-1--bldrs-share-prod.netlify.app'

    it('is the target\'s /popup-callback, with any query', () => {
      expect(isCallbackUrl(`${target}/popup-callback?code=x&state=y`, target)).toBe(true)
      expect(isCallbackUrl(`${target}/popup-callback`, target)).toBe(true)
    })

    it('is not another path, nor the same path on another origin', () => {
      expect(isCallbackUrl(`${target}/popup-auth`, target)).toBe(false)
      expect(isCallbackUrl('https://bldrs.us.auth0.com/popup-callback', target)).toBe(false)
      expect(isCallbackUrl('about:blank', target)).toBe(false)
    })
  })

  describe('loginCompletion', () => {
    it('is done once the session is cached, whether or not the page survived', () => {
      expect(loginCompletion({...base, reachedCallback: true, hasSession: true})).toEqual({state: 'done'})
      // The race Codex found (P1 on #1942): PopupCallback cached the tokens
      // and closed its page; the session is read from a surviving page.
      expect(loginCompletion({...base, reachedCallback: true, closedAtMs: T0 - 10, hasSession: true}))
        .toEqual({state: 'done'})
    })

    it('waits while the callback page is open and the cache still empty', () => {
      expect(loginCompletion({...base, reachedCallback: true, hasSession: false})).toEqual({state: 'pending'})
      expect(loginCompletion({...base, reachedCallback: true, hasSession: null})).toEqual({state: 'pending'})
    })

    it('treats the callback page closing as completion, but checks it, briefly, before failing', () => {
      const closed = {...base, reachedCallback: true, closedAtMs: T0, hasSession: false}
      expect(loginCompletion({...closed, nowMs: T0 + 100})).toEqual({state: 'pending'})
      expect(loginCompletion({...closed, nowMs: T0 + CLOSE_GRACE_MS})).toEqual({state: 'failed',
        reason: '/popup-callback closed its page, but no Auth0 session was cached in this context'})
    })

    it('fails at once when the page closed before it reached /popup-callback', () => {
      expect(loginCompletion({...base, closedAtMs: T0, hasSession: false})).toEqual({state: 'failed',
        reason: 'the login page closed before it reached /popup-callback'})
      expect(loginCompletion({...base, closedAtMs: T0, hasSession: null}).state).toBe('failed')
    })

    it('says where it stopped when the time runs out', () => {
      expect(loginCompletion({...base, deadlinePassed: true})).toEqual({state: 'failed',
        reason: 'the login never reached /popup-callback'})
      expect(loginCompletion({...base, reachedCallback: true, hasSession: false, deadlinePassed: true}))
        .toEqual({state: 'failed', reason: '/popup-callback was reached, but no Auth0 session was cached in this context'})
    })
  })
})
