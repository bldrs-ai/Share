import {allowedLoginHosts, loginPageProblem} from './loginHosts.js'


describe('live-smoke/loginHosts', () => {
  describe('allowedLoginHosts', () => {
    it('allows the tenant domain, normalised', () => {
      expect(allowedLoginHosts({LIVE_SMOKE_AUTH0_DOMAIN: 'https://Bldrs.us.auth0.com/'}))
        .toEqual({hosts: ['bldrs.us.auth0.com'], isUnset: false, problem: null})
    })

    it('adds a custom login host when one is named', () => {
      expect(allowedLoginHosts({LIVE_SMOKE_AUTH0_DOMAIN: 'bldrs.us.auth0.com', LIVE_SMOKE_AUTH0_LOGIN_HOST: 'login.bldrs.ai'}).hosts)
        .toEqual(['bldrs.us.auth0.com', 'login.bldrs.ai'])
      expect(allowedLoginHosts({LIVE_SMOKE_AUTH0_LOGIN_HOST: 'login.bldrs.ai'}).hosts).toEqual(['login.bldrs.ai'])
    })

    it('fails closed when neither is set: no hosts, and a reason', () => {
      expect(allowedLoginHosts({})).toEqual({
        hosts: [],
        isUnset: true,
        problem: 'LIVE_SMOKE_AUTH0_DOMAIN (or LIVE_SMOKE_AUTH0_LOGIN_HOST) is not set, so no login page can be trusted with a password',
      })
    })

    it('refuses a value that is not a bare host name', () => {
      for (const bad of ['bldrs.us.auth0.com/login', 'user@bldrs.us.auth0.com', 'bldrs.us.auth0.com:8443', '*.auth0.com']) {
        const {hosts, problem} = allowedLoginHosts({LIVE_SMOKE_AUTH0_DOMAIN: bad})
        expect(hosts).toEqual([])
        expect(problem).toMatch(/is not a host name/)
        expect(allowedLoginHosts({LIVE_SMOKE_AUTH0_DOMAIN: bad}).isUnset).toBe(false)
      }
    })
  })

  describe('loginPageProblem', () => {
    const hosts = ['bldrs.us.auth0.com']

    it('accepts the exact host over https', () => {
      expect(loginPageProblem('https://bldrs.us.auth0.com/u/login?state=x', hosts)).toBeNull()
      expect(loginPageProblem('https://BLDRS.us.auth0.com/u/login', hosts)).toBeNull()
    })

    it('rejects lookalikes', () => {
      for (const href of [
        'https://bldrs.us.auth0.com.evil.com/u/login',
        'https://evil-bldrs.us.auth0.com/u/login',
        'https://evil.com/bldrs.us.auth0.com/u/login',
        'https://bldrs.us.auth0.com@evil.com/u/login',
        'https://other.us.auth0.com/u/login',
      ]) {
        expect(loginPageProblem(href, hosts)).toMatch(/is not an allowed Auth0 login host/)
      }
    })

    it('rejects http and a non-default port, even on the right host', () => {
      expect(loginPageProblem('http://bldrs.us.auth0.com/u/login', hosts)).toMatch(/not https/)
      expect(loginPageProblem('https://bldrs.us.auth0.com:8443/u/login', hosts)).toMatch(/non-default port/)
    })

    it('fails closed with no allowed hosts, or no URL', () => {
      expect(loginPageProblem('https://bldrs.us.auth0.com/u/login', [])).toMatch(/no allowed Auth0 login host/)
      expect(loginPageProblem('about:blank', hosts)).toMatch(/not https/)
      expect(loginPageProblem('not a url', hosts)).toMatch(/not a URL/)
    })
  })
})
