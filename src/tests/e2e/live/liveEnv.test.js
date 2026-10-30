/* eslint-disable no-magic-numbers */
import {
  allowedLoginHosts,
  claimedSubscriptionStatus,
  freeTierFromProbe,
  liveAdminFrom,
  liveTargetFrom,
  loginPageProblem,
} from './liveEnv'


describe('live/liveEnv', () => {
  describe('liveTargetFrom', () => {
    const CI = {CI: 'true'}

    it('skips, with the variable named, when LIVE_BASE_URL is unset or blank', () => {
      expect(liveTargetFrom(undefined, CI)).toEqual({target: null, skip: 'LIVE_BASE_URL is not set', problem: null})
      expect(liveTargetFrom('  ', CI).skip).toBe('LIVE_BASE_URL is not set')
    })

    it('takes an allowed deploy preview, drops a trailing slash, and expects functions there', () => {
      const {target, skip, problem} = liveTargetFrom('https://deploy-preview-1939--bldrs-share-prod.netlify.app/', CI)
      expect(skip).toBeNull()
      expect(problem).toBeNull()
      expect(target).toEqual({
        baseUrl: 'https://deploy-preview-1939--bldrs-share-prod.netlify.app',
        hostname: 'deploy-preview-1939--bldrs-share-prod.netlify.app',
        servesFunctions: true,
      })
    })

    it('takes a local http build outside CI only, with no functions behind it', () => {
      expect(liveTargetFrom('http://localhost:9081', {}).target)
        .toEqual({baseUrl: 'http://localhost:9081', hostname: 'localhost', servesFunctions: false})
      expect(liveTargetFrom('http://127.0.0.1:8080', {}).target.servesFunctions).toBe(false)
      expect(liveTargetFrom('http://localhost:9081', CI).target).toBeNull()
      expect(liveTargetFrom('http://localhost:9081', CI).problem).toMatch(/not allowed in CI/)
    })

    it('refuses rather than skips a value that is set and wrong, or off the allow-list', () => {
      expect(liveTargetFrom('bldrs.ai', CI).problem).toBe('LIVE_BASE_URL is not a URL: bldrs.ai')
      for (const url of [
        'http://bldrs.ai',
        'https://bldrs.ai/share/v/p/index.ifc',
        'https://bldrs.ai/?feature=export',
        'https://evil.example',
        'https://deploy-preview-1--attacker.netlify.app',
      ]) {
        const {target, skip, problem} = liveTargetFrom(url, CI)
        expect([target, skip]).toEqual([null, null])
        expect(problem).toMatch(/\S/)
      }
    })
  })

  describe('the login-host gate, as the specs import it', () => {
    it('trusts only the configured tenant, exactly, over https', () => {
      const {hosts} = allowedLoginHosts({LIVE_SMOKE_AUTH0_DOMAIN: 'bldrs.us.auth0.com'})
      expect(loginPageProblem('https://bldrs.us.auth0.com/u/login', hosts)).toBeNull()
      expect(loginPageProblem('https://bldrs.us.auth0.com.evil.com/u/login', hosts)).toMatch(/not an allowed/)
      expect(loginPageProblem('http://bldrs.us.auth0.com/u/login', hosts)).toMatch(/not https/)
    })

    it('fails closed when no host is configured', () => {
      const {hosts, problem} = allowedLoginHosts({})
      expect(problem).toMatch(/not set/)
      expect(loginPageProblem('https://bldrs.us.auth0.com/u/login', hosts)).toMatch(/no allowed Auth0 login host/)
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
