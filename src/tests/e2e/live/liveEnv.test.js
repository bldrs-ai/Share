/* eslint-disable no-magic-numbers */
import {claimedSubscriptionStatus, freeTierFromProbe, liveAdminFrom, liveTargetFrom} from './liveEnv'


describe('live/liveEnv', () => {
  describe('liveTargetFrom', () => {
    it('skips, with the variable named, when LIVE_BASE_URL is unset or blank', () => {
      expect(liveTargetFrom(undefined)).toEqual({target: null, skip: 'LIVE_BASE_URL is not set', problem: null})
      expect(liveTargetFrom('  ').skip).toBe('LIVE_BASE_URL is not set')
    })

    it('takes a deploy preview, drops a trailing slash, and expects functions there', () => {
      const {target, skip, problem} = liveTargetFrom('https://deploy-preview-1939--bldrs-share-prod.netlify.app/')
      expect(skip).toBeNull()
      expect(problem).toBeNull()
      expect(target).toEqual({
        baseUrl: 'https://deploy-preview-1939--bldrs-share-prod.netlify.app',
        hostname: 'deploy-preview-1939--bldrs-share-prod.netlify.app',
        servesFunctions: true,
      })
    })

    it('takes a local http build, which has no functions behind it', () => {
      expect(liveTargetFrom('http://localhost:9081').target)
        .toEqual({baseUrl: 'http://localhost:9081', hostname: 'localhost', servesFunctions: false})
      expect(liveTargetFrom('http://127.0.0.1:8080').target.servesFunctions).toBe(false)
    })

    it('refuses rather than skips a value that is set and wrong', () => {
      expect(liveTargetFrom('bldrs.ai').problem).toBe('LIVE_BASE_URL is not a URL: bldrs.ai')
      expect(liveTargetFrom('http://bldrs.ai').problem).toBe('LIVE_BASE_URL must be https (or http on localhost): http://bldrs.ai')
      expect(liveTargetFrom('https://bldrs.ai/share/v/p/index.ifc').problem)
        .toBe('LIVE_BASE_URL must be an origin with no path: https://bldrs.ai/share/v/p/index.ifc')
      expect(liveTargetFrom('https://bldrs.ai/?feature=export').skip).toBeNull()
      expect(liveTargetFrom('https://bldrs.ai/?feature=export').target).toBeNull()
    })
  })

  describe('freeTierFromProbe', () => {
    it('reads an auth refusal as the allowance being deployed (#1939 answers GET)', () => {
      expect(freeTierFromProbe(401)).toBe('present')
    })

    it('reads a method refusal as main, which takes POST only', () => {
      expect(freeTierFromProbe(405)).toBe('absent')
    })

    it('guesses nothing from any other answer', () => {
      for (const status of [200, 403, 404, 500, 502]) {
        expect(freeTierFromProbe(status)).toBe('unknown')
      }
    })
  })

  describe('liveAdminFrom', () => {
    const full = {
      LIVE_SMOKE_AUTH0_DOMAIN: 'tenant.example.auth0.com',
      LIVE_SMOKE_AUTH0_CLIENT_ID: 'id',
      LIVE_SMOKE_AUTH0_CLIENT_SECRET: 'secret',
    }

    it('skips when no credential is set', () => {
      const {admin, skip, problem} = liveAdminFrom({})
      expect(admin).toBeNull()
      expect(problem).toBeNull()
      expect(skip).toBe('LIVE_SMOKE_AUTH0_DOMAIN, LIVE_SMOKE_AUTH0_CLIENT_ID, LIVE_SMOKE_AUTH0_CLIENT_SECRET are not set')
    })

    it('calls a half-set configuration a problem, not a skip', () => {
      const {admin, skip, problem} = liveAdminFrom({...full, LIVE_SMOKE_AUTH0_CLIENT_SECRET: ''})
      expect(admin).toBeNull()
      expect(skip).toBeNull()
      expect(problem).toBe('LIVE_SMOKE_AUTH0_CLIENT_SECRET is not set')
    })

    it('builds a client from a full set', () => {
      expect(typeof liveAdminFrom(full).admin.findUserByEmail).toBe('function')
    })
  })

  describe('claimedSubscriptionStatus', () => {
    const jwt = (payload) => ['e30', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.')

    it('reads the tier the session\'s token claims', () => {
      const token = jwt({'sub': 'auth0|1', 'https://bldrs.ai/app_metadata': {subscriptionStatus: 'shareProPendingReauth'}})
      expect(claimedSubscriptionStatus(token)).toBe('shareProPendingReauth')
    })

    it('is null for a token with no claim, and throws on something that is not a JWT', () => {
      expect(claimedSubscriptionStatus(jwt({sub: 'auth0|1'}))).toBeNull()
      expect(() => claimedSubscriptionStatus('opaque-token')).toThrow('not a JWT')
    })
  })
})
