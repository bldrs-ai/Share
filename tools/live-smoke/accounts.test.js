import {LIVE_PROJECTS, accountFor, parseLiveAccounts} from './accounts.js'


const free = (project) => ({email: `free-${project}@example.test`, password: `pw-${project}`})
const FULL = {
  pro: {email: 'pro@example.test', password: 'pw-pro'},
  pending: {email: 'pending@example.test', password: 'pw-pending'},
  free: Object.fromEntries(LIVE_PROJECTS.map((project) => [project, free(project)])),
}


describe('live-smoke/accounts', () => {
  it('parses a full account map', () => {
    const {accounts, problem} = parseLiveAccounts(JSON.stringify(FULL))
    expect(problem).toBeNull()
    expect(accounts.pro.email).toBe('pro@example.test')
    expect(accounts.pending.password).toBe('pw-pending')
    expect(Object.keys(accounts.free).sort()).toEqual([...LIVE_PROJECTS].sort())
  })

  it('accepts a partial map, so a run can cover only the tiers it has accounts for', () => {
    const {accounts, problem} = parseLiveAccounts(JSON.stringify({pro: FULL.pro}))
    expect(problem).toBeNull()
    expect(accounts.pending).toBeNull()
    expect(accounts.free).toEqual({})
  })

  it('says the variable is unset rather than parsing nothing', () => {
    expect(parseLiveAccounts(undefined)).toEqual({accounts: null, problem: 'LIVE_SMOKE_ACCOUNTS is not set'})
    expect(parseLiveAccounts('  ')).toEqual({accounts: null, problem: 'LIVE_SMOKE_ACCOUNTS is not set'})
  })

  it('never echoes the secret when it fails to parse', () => {
    const raw = '{"pro": {"email": "pro@example.test", "password": "hunter2"'
    const {accounts, problem} = parseLiveAccounts(raw)
    expect(accounts).toBeNull()
    expect(problem).toBe('LIVE_SMOKE_ACCOUNTS is not valid JSON')
    expect(problem).not.toContain('hunter2')
  })

  it('rejects a misspelt role instead of silently skipping its specs', () => {
    const {problem} = parseLiveAccounts(JSON.stringify({...FULL, pendng: FULL.pending}))
    expect(problem).toBe('LIVE_SMOKE_ACCOUNTS has an unknown key "pendng" (expected pro, pending, free)')
  })

  it('rejects a free account for a project the config does not run', () => {
    const {problem} = parseLiveAccounts(JSON.stringify({free: {safari: free('safari')}}))
    expect(problem).toContain('free.safari')
    expect(problem).toContain(LIVE_PROJECTS.join(', '))
  })

  it('names the field that is wrong, and not its value', () => {
    const noPassword = {...FULL, pro: {email: 'pro@example.test'}}
    expect(parseLiveAccounts(JSON.stringify(noPassword)).problem)
      .toBe('LIVE_SMOKE_ACCOUNTS.pro.password must be a non-empty string')
    const badEmail = {...FULL, free: {...FULL.free, webkit: {email: 'not-an-address', password: 'x'}}}
    const {problem} = parseLiveAccounts(JSON.stringify(badEmail))
    expect(problem).toBe('LIVE_SMOKE_ACCOUNTS.free.webkit.email must be an email address')
    expect(problem).not.toContain('not-an-address')
  })

  it('refuses one address in two roles: the reset would fight itself', () => {
    const shared = {...FULL, pending: {email: 'PRO@example.test', password: 'x'}}
    expect(parseLiveAccounts(JSON.stringify(shared)).problem)
      .toBe('LIVE_SMOKE_ACCOUNTS uses one email for both pro and pending')
  })

  describe('accountFor', () => {
    const {accounts} = parseLiveAccounts(JSON.stringify({pro: FULL.pro, free: {chromium: free('chromium')}}))

    it('finds a shared role whatever the project', () => {
      expect(accountFor(accounts, 'pro', 'webkit')).toEqual({account: FULL.pro, skip: null})
    })

    it('finds a free account by project, and only by project', () => {
      expect(accountFor(accounts, 'free', 'chromium').account).toEqual(free('chromium'))
      expect(accountFor(accounts, 'free', 'firefox'))
        .toEqual({account: null, skip: 'LIVE_SMOKE_ACCOUNTS has no free account for project "firefox"'})
    })

    it('skips with a reason when the role is missing or the map is', () => {
      expect(accountFor(accounts, 'pending', 'chromium'))
        .toEqual({account: null, skip: 'LIVE_SMOKE_ACCOUNTS has no pending account'})
      expect(accountFor(null, 'pro', 'chromium').skip).toBe('LIVE_SMOKE_ACCOUNTS is not set or not usable')
    })
  })
})
