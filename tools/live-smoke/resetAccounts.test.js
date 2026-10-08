import {createAuth0Admin} from './auth0Management.js'
import {main, resetAccounts} from './resetAccounts.mjs'


/* eslint-disable no-magic-numbers */
const DOMAIN = 'tenant.example.auth0.com'
const CONFIG = {domain: DOMAIN, clientId: 'm2m-client', clientSecret: 'm2m-secret'}
const DB = 'share-live-smoke'

const ACCOUNTS = {
  pro: {email: 'pro@example.test', password: 'pw-pro'},
  pending: {email: 'pending@example.test', password: 'pw-pending'},
  free: {
    chromium: {email: 'free-chromium@example.test', password: 'pw-free-c'},
    firefox: {email: 'free-firefox@example.test', password: 'pw-free-f'},
  },
}


/**
 * An in-memory Auth0: the token endpoint and the three Management API
 * routes the reset uses, with PATCH merging `app_metadata` at the top level
 * the way Auth0 does. Records every request so a test can say what was and
 * was not written.
 *
 * @param {Array<object>} users `{user_id, email, connection, app_metadata}`
 * @param {object} [options]
 * @param {boolean} [options.ignorePatches] accept PATCHes but drop them
 * @param {Array<object>} [options.answersBefore] canned responses served first
 * @return {Function} fetch, with `.calls` and `.users`
 */
function fakeAuth0(users, {ignorePatches = false, answersBefore = []} = {}) {
  const byId = new Map(users.map((u) => [u.user_id, structuredClone(u)]))
  const queued = [...answersBefore]
  const calls = []
  const json = (status, body, headers = {}) =>
    new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json', ...headers}})
  const toApi = (u) => ({
    user_id: u.user_id,
    email: u.email,
    identities: [{connection: u.connection, provider: u.connection === DB ? 'auth0' : 'github'}],
    app_metadata: u.app_metadata,
  })
  const route = (url, init) => {
    const {pathname, searchParams} = new URL(url)
    const method = init.method || 'GET'
    const body = init.body ? JSON.parse(init.body) : null
    calls.push({method, pathname, search: searchParams.toString(), body, headers: init.headers || {}})
    if (queued.length > 0) {
      const next = queued.shift()
      return json(next.status, next.body || {}, next.headers)
    }
    if (pathname === '/oauth/token' && method === 'POST') {
      return json(200, {access_token: 'mgmt-token', token_type: 'Bearer', expires_in: 86400})
    }
    if (pathname === '/api/v2/users-by-email' && method === 'GET') {
      const email = searchParams.get('email').toLowerCase()
      return json(200, [...byId.values()].filter((u) => u.email.toLowerCase() === email).map(toApi))
    }
    const match = pathname.match(/^\/api\/v2\/users\/(.+)$/)
    if (match) {
      const user = byId.get(decodeURIComponent(match[1]))
      if (!user) {
        return json(404, {statusCode: 404, error: 'Not Found', message: 'The user does not exist.'})
      }
      if (method === 'PATCH') {
        if (!ignorePatches) {
          user.app_metadata = {...(user.app_metadata || {}), ...body.app_metadata}
        }
        return json(200, toApi(user))
      }
      return json(200, toApi(user))
    }
    return json(404, {message: `unrouted ${method} ${pathname}`})
  }
  const impl = (url, init = {}) => Promise.resolve(route(url, init))
  impl.calls = calls
  impl.users = byId
  return impl
}


/** @return {Array<object>} a tenant in the state a clean run expects */
function healthyTenant() {
  return [
    {user_id: 'auth0|pro', email: 'pro@example.test', connection: DB,
      app_metadata: {subscriptionStatus: 'sharePro', comped: true, exports: [{id: 'p1'}]}},
    // What the Auth0 Action leaves after the last run's login: promoted.
    {user_id: 'auth0|pending', email: 'pending@example.test', connection: DB,
      app_metadata: {subscriptionStatus: 'sharePro'}},
    {user_id: 'auth0|free-c', email: 'free-chromium@example.test', connection: DB,
      app_metadata: {exports: [{id: 'f1', free: true}, {id: 'f2', free: true}], usageQuota: {n: 3}}},
    {user_id: 'auth0|free-f', email: 'free-firefox@example.test', connection: DB, app_metadata: {}},
  ]
}


const patches = (fetchImpl) => fetchImpl.calls.filter((c) => c.method === 'PATCH')
const noSleep = () => Promise.resolve()


describe('live-smoke/resetAccounts', () => {
  it('builds no client and makes no request until asked', () => {
    const fetchImpl = fakeAuth0(healthyTenant())
    createAuth0Admin(CONFIG, {fetchImpl})
    expect(fetchImpl.calls).toHaveLength(0)
  })

  it('asks for a client-credentials token for the Management API, once', async () => {
    const fetchImpl = fakeAuth0(healthyTenant())
    await resetAccounts({accounts: ACCOUNTS, admin: createAuth0Admin(CONFIG, {fetchImpl})})
    const tokenCalls = fetchImpl.calls.filter((c) => c.pathname === '/oauth/token')
    expect(tokenCalls).toHaveLength(1)
    expect(tokenCalls[0].body).toEqual({
      grant_type: 'client_credentials',
      client_id: 'm2m-client',
      client_secret: 'm2m-secret',
      audience: `https://${DOMAIN}/api/v2/`,
    })
    const apiCalls = fetchImpl.calls.filter((c) => c.pathname.startsWith('/api/v2/'))
    expect(apiCalls.length).toBeGreaterThan(0)
    expect(apiCalls.every((c) => c.headers.Authorization === 'Bearer mgmt-token')).toBe(true)
  })

  it('clears free ledgers, sets pending back, and leaves the comped Pro alone', async () => {
    const fetchImpl = fakeAuth0(healthyTenant())
    const result = await resetAccounts({accounts: ACCOUNTS, admin: createAuth0Admin(CONFIG, {fetchImpl})})

    expect(result.drift).toEqual([])
    expect(fetchImpl.users.get('auth0|free-c').app_metadata).toEqual({exports: [], usageQuota: {n: 3}})
    expect(fetchImpl.users.get('auth0|pending').app_metadata.subscriptionStatus).toBe('shareProPendingReauth')
    // Exactly the two writes that were needed: the empty free ledger and the
    // pro account are not written to at all.
    expect(patches(fetchImpl).map((c) => [c.pathname, c.body])).toEqual([
      ['/api/v2/users/auth0%7Cpending', {app_metadata: {subscriptionStatus: 'shareProPendingReauth'}}],
      ['/api/v2/users/auth0%7Cfree-c', {app_metadata: {exports: []}}],
    ])
    expect(result.rows.map((r) => [r.role, r.userId, r.action])).toEqual([
      ['pro', 'auth0|pro', 'verified comped Pro'],
      ['pending', 'auth0|pending', 'set shareProPendingReauth (was sharePro)'],
      ['free.chromium', 'auth0|free-c', 'cleared 2 export rows'],
      ['free.firefox', 'auth0|free-f', 'nothing to clear'],
    ])
  })

  it('writes nothing on a dry run, and says what it would have done', async () => {
    const fetchImpl = fakeAuth0(healthyTenant())
    const result = await resetAccounts({accounts: ACCOUNTS, admin: createAuth0Admin(CONFIG, {fetchImpl}), dryRun: true})
    expect(patches(fetchImpl)).toHaveLength(0)
    expect(result.rows.find((r) => r.role === 'pending').action)
      .toBe('would set shareProPendingReauth (was sharePro)')
  })

  it.each([
    ['not comped', {subscriptionStatus: 'sharePro'}, 'pro is not comped (app_metadata.comped must be exactly true)'],
    ['comped as a string', {subscriptionStatus: 'sharePro', comped: 'true'},
      'pro is not comped (app_metadata.comped must be exactly true)'],
    ['still pending', {subscriptionStatus: 'shareProPendingReauth', comped: true},
      'pro has subscriptionStatus "shareProPendingReauth", not sharePro'],
    ['linked to Stripe', {subscriptionStatus: 'sharePro', comped: true, stripeCustomerId: 'cus_123'},
      'pro has a stripeCustomerId: the daily reconcile sweep would judge it against Stripe'],
  ])('fails on a Pro account that is %s, without touching it', async (label, appMetadata, reason) => {
    const tenant = healthyTenant()
    tenant[0].app_metadata = appMetadata
    const fetchImpl = fakeAuth0(tenant)
    const result = await resetAccounts({accounts: ACCOUNTS, admin: createAuth0Admin(CONFIG, {fetchImpl})})
    expect(result.drift).toEqual([{role: 'pro', userId: 'auth0|pro', reason}])
    expect(patches(fetchImpl).some((c) => c.pathname.includes('pro'))).toBe(false)
  })

  it('fails on a pending account linked to Stripe: the sweep would demote it', async () => {
    const tenant = healthyTenant()
    tenant[1].app_metadata = {subscriptionStatus: 'shareProPendingReauth', stripeCustomerId: 'cus_9'}
    const fetchImpl = fakeAuth0(tenant)
    const result = await resetAccounts({accounts: ACCOUNTS, admin: createAuth0Admin(CONFIG, {fetchImpl})})
    expect(result.drift).toEqual([{role: 'pending', userId: 'auth0|pending',
      reason: 'pending has a stripeCustomerId: the daily reconcile sweep would demote it'}])
    expect(patches(fetchImpl).some((c) => c.pathname.includes('pending'))).toBe(false)
  })

  it('fails on a pending account something other than the Action moved', async () => {
    const tenant = healthyTenant()
    tenant[1].app_metadata = {subscriptionStatus: 'freePendingReauth'}
    const fetchImpl = fakeAuth0(tenant)
    const result = await resetAccounts({accounts: ACCOUNTS, admin: createAuth0Admin(CONFIG, {fetchImpl})})
    expect(result.drift.map((d) => d.reason))
      .toEqual(['pending has subscriptionStatus "freePendingReauth"; expected shareProPendingReauth or sharePro'])
    expect(fetchImpl.users.get('auth0|pending').app_metadata.subscriptionStatus).toBe('freePendingReauth')
  })

  it.each([
    ['Pro', {subscriptionStatus: 'sharePro'},
      'free.firefox has subscriptionStatus "sharePro"; a free account must have none, or "free"'],
    ['reauth-pending', {subscriptionStatus: 'freePendingReauth'},
      'free.firefox has subscriptionStatus "freePendingReauth"; a free account must have none, or "free"'],
    ['linked to Stripe', {stripeCustomerId: 'cus_1'}, 'free.firefox has a stripeCustomerId'],
  ])('fails on a free account that is %s, without clearing it', async (label, appMetadata, reason) => {
    const tenant = healthyTenant()
    tenant[3].app_metadata = {...appMetadata, exports: [{id: 'x', free: true}]}
    const fetchImpl = fakeAuth0(tenant)
    const result = await resetAccounts({accounts: ACCOUNTS, admin: createAuth0Admin(CONFIG, {fetchImpl})})
    expect(result.drift).toEqual([{role: 'free.firefox', userId: 'auth0|free-f', reason}])
    expect(fetchImpl.users.get('auth0|free-f').app_metadata.exports).toHaveLength(1)
  })

  it('finds the Database-connection user, ignores a social one with the same email, and names no email', async () => {
    const tenant = healthyTenant()
    tenant.push({user_id: 'github|77', email: 'pro@example.test', connection: 'github', app_metadata: {}})
    tenant.splice(3, 1)
    const fetchImpl = fakeAuth0(tenant)
    const result = await resetAccounts({accounts: ACCOUNTS, admin: createAuth0Admin(CONFIG, {fetchImpl})})
    expect(result.rows.find((r) => r.role === 'pro').userId).toBe('auth0|pro')
    expect(result.drift).toEqual([{role: 'free.firefox', userId: null,
      reason: `free.firefox: no ${DB} user has that email`}])
    expect(JSON.stringify(result)).not.toContain('free-firefox@example.test')
  })

  it('fails when two Database users share the email', async () => {
    const tenant = healthyTenant()
    tenant.push({user_id: 'auth0|pro-2', email: 'PRO@example.test', connection: DB, app_metadata: {}})
    const fetchImpl = fakeAuth0(tenant)
    const result = await resetAccounts({accounts: ACCOUNTS, admin: createAuth0Admin(CONFIG, {fetchImpl})})
    expect(result.drift).toEqual([{role: 'pro', userId: null, reason: `pro: 2 ${DB} users have that email`}])
  })

  it('reads back every write, and fails when one did not land', async () => {
    const fetchImpl = fakeAuth0(healthyTenant(), {ignorePatches: true})
    const result = await resetAccounts({accounts: ACCOUNTS, admin: createAuth0Admin(CONFIG, {fetchImpl})})
    expect(result.drift).toEqual([
      {role: 'pending', userId: 'auth0|pending', reason: 'pending: the write did not land (still "sharePro")'},
      {role: 'free.chromium', userId: 'auth0|free-c',
        reason: 'free.chromium: the write did not land (2 export rows remain)'},
    ])
  })

  it('waits out a rate limit and retries, as Auth0 asks', async () => {
    const sleeps = []
    const sleep = (ms) => {
      sleeps.push(ms)
      return Promise.resolve()
    }
    const fetchImpl = fakeAuth0(healthyTenant(), {answersBefore: [
      {status: 200, body: {access_token: 'mgmt-token', expires_in: 86400}},
      {status: 429, body: {message: 'Too Many Requests'}, headers: {'retry-after': '2'}},
    ]})
    const result = await resetAccounts({accounts: ACCOUNTS, admin: createAuth0Admin(CONFIG, {fetchImpl, sleep})})
    expect(result.drift).toEqual([])
    expect(sleeps).toEqual([2000])
  })

  it('gives up after repeated rate limits with an error naming the step', async () => {
    const limited = {status: 429, body: {message: 'Too Many Requests'}}
    const fetchImpl = fakeAuth0(healthyTenant(), {answersBefore: [
      {status: 200, body: {access_token: 'mgmt-token', expires_in: 86400}}, limited, limited, limited, limited,
    ]})
    const result = await resetAccounts({accounts: ACCOUNTS, admin: createAuth0Admin(CONFIG, {fetchImpl, sleep: noSleep})})
    expect(result.drift[0]).toEqual({role: 'pro', userId: null,
      reason: 'pro: Auth0 Management API GET users-by-email answered 429 after 4 attempts'})
  })

  describe('main', () => {
    const ENV = {
      LIVE_SMOKE_ACCOUNTS: JSON.stringify(ACCOUNTS),
      LIVE_SMOKE_AUTH0_DOMAIN: `https://${DOMAIN}/`,
      LIVE_SMOKE_AUTH0_CLIENT_ID: 'm2m-client',
      LIVE_SMOKE_AUTH0_CLIENT_SECRET: 'm2m-secret',
    }
    const capture = () => {
      const out = []
      return {write: (s) => out.push(s), text: () => out.join('')}
    }

    it('exits 0 on a clean reset and prints a report without secrets', async () => {
      const stdout = capture()
      const code = await main([], ENV, {fetchImpl: fakeAuth0(healthyTenant()), stdout, sleep: noSleep})
      expect(code).toBe(0)
      expect(stdout.text()).toContain('| pending | auth0|pending | set shareProPendingReauth (was sharePro) |')
      for (const secret of ['pw-pro', 'm2m-secret', 'pending@example.test']) {
        expect(stdout.text()).not.toContain(secret)
      }
    })

    it('exits 1 on drift', async () => {
      const tenant = healthyTenant()
      tenant[0].app_metadata = {subscriptionStatus: 'sharePro'}
      const stdout = capture()
      const code = await main([], ENV, {fetchImpl: fakeAuth0(tenant), stdout, sleep: noSleep})
      expect(code).toBe(1)
      expect(stdout.text()).toContain('**DRIFT** pro is not comped')
    })

    it('refuses to run unconfigured, unless told that is expected', async () => {
      const stdout = capture()
      expect(await main([], {}, {fetchImpl: fakeAuth0([]), stdout})).toBe(2)
      expect(stdout.text()).toContain('LIVE_SMOKE_ACCOUNTS is not set')
      const quiet = capture()
      const fetchImpl = fakeAuth0([])
      expect(await main(['--if-configured'], {}, {fetchImpl, stdout: quiet})).toBe(0)
      expect(quiet.text()).toContain('Skipped: LIVE_SMOKE_ACCOUNTS is not set')
      expect(fetchImpl.calls).toHaveLength(0)
    })

    it('refuses a half-configured Management API even with --if-configured', async () => {
      const stdout = capture()
      const env = {...ENV, LIVE_SMOKE_AUTH0_CLIENT_SECRET: ''}
      expect(await main(['--if-configured'], env, {fetchImpl: fakeAuth0([]), stdout})).toBe(2)
      expect(stdout.text()).toContain('LIVE_SMOKE_AUTH0_CLIENT_SECRET is not set')
    })
  })
})
