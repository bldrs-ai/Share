/**
 * The live smoke harness's test accounts, as the `LIVE_SMOKE_ACCOUNTS`
 * secret holds them (design/new/live-browser-smoke.md §"Accounts").
 *
 * Shared by the reset script (`resetAccounts.mjs`) and the specs
 * (`src/tests/e2e/live/liveEnv.ts`), so the two cannot disagree about which
 * account is which. Dependency-free, and free of any Playwright import, so
 * the specs' helper can import it without dragging Playwright's `expect`
 * into a Jest suite (src/tests/e2e/README.md says why that matters).
 *
 * The value is a secret: every message here names the FIELD that is wrong,
 * never its value. GitHub masks a secret only where its whole value appears
 * in a log, so an email or password echoed out of this JSON would be printed
 * in the clear.
 */


/**
 * The Playwright projects in `tools/playwright.live.config.js`, which are
 * also the keys of the `free` map. One free account per project, because the
 * free-tier spec spends that account's weekly allowance and projects run in
 * parallel: two projects sharing an account would each see the other's
 * exports in the count.
 */
export const LIVE_PROJECTS = ['chromium', 'firefox', 'webkit', 'mobile-iphone', 'mobile-pixel']

/** Roles with one account shared by every project. */
const SHARED_ROLES = ['pro', 'pending']
const TOP_LEVEL_KEYS = [...SHARED_ROLES, 'free']
const VAR = 'LIVE_SMOKE_ACCOUNTS'


/**
 * @typedef {{email: string, password: string}} LiveAccount
 * @typedef {{pro: ?LiveAccount, pending: ?LiveAccount, free: {[project: string]: LiveAccount}}} LiveAccounts
 */


/**
 * Parse and check the account map.
 *
 * A partial map is fine — a run with only a Pro account runs the Pro specs
 * and skips the rest — but a map with a misspelt key is refused outright:
 * `"pendng"` would otherwise read as "no pending account" and its spec would
 * skip forever without anyone noticing.
 *
 * @param {string|undefined} raw the secret's value
 * @return {{accounts: ?LiveAccounts, problem: ?string}} exactly one is non-null
 */
export function parseLiveAccounts(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return refuse(`${VAR} is not set`)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return refuse(`${VAR} is not valid JSON`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return refuse(`${VAR} must be a JSON object`)
  }
  for (const key of Object.keys(parsed)) {
    if (!TOP_LEVEL_KEYS.includes(key)) {
      return refuse(`${VAR} has an unknown key "${key}" (expected ${TOP_LEVEL_KEYS.join(', ')})`)
    }
  }

  /** @type {LiveAccounts} */
  const accounts = {pro: null, pending: null, free: {}}
  for (const role of SHARED_ROLES) {
    if (parsed[role] !== undefined) {
      const problem = accountProblem(parsed[role], role)
      if (problem) {
        return refuse(problem)
      }
      accounts[role === 'pro' ? 'pro' : 'pending'] = {email: parsed[role].email, password: parsed[role].password}
    }
  }
  if (parsed.free !== undefined) {
    if (parsed.free === null || typeof parsed.free !== 'object' || Array.isArray(parsed.free)) {
      return refuse(`${VAR}.free must be an object keyed by project`)
    }
    for (const [project, entry] of Object.entries(parsed.free)) {
      if (!LIVE_PROJECTS.includes(project)) {
        return refuse(`${VAR} has free.${project}, which is not a project (expected ${LIVE_PROJECTS.join(', ')})`)
      }
      const problem = accountProblem(entry, `free.${project}`)
      if (problem) {
        return refuse(problem)
      }
      const account = /** @type {LiveAccount} */ (entry)
      accounts.free[project] = {email: account.email, password: account.password}
    }
  }

  // One address in two roles would have the reset script set it pending and
  // then clear it as free (or check it is comped Pro), and the specs would
  // each be testing whatever the last write left.
  const seen = new Map()
  /** @type {Array<[string, LiveAccount]>} */
  const roles = []
  for (const role of SHARED_ROLES) {
    const account = role === 'pro' ? accounts.pro : accounts.pending
    if (account) {
      roles.push([role, account])
    }
  }
  for (const [project, account] of Object.entries(accounts.free)) {
    roles.push([`free.${project}`, account])
  }
  for (const [role, account] of roles) {
    const email = account.email.toLowerCase()
    if (seen.has(email)) {
      return refuse(`${VAR} uses one email for both ${seen.get(email)} and ${role}`)
    }
    seen.set(email, role)
  }
  return {accounts, problem: null}
}


/**
 * The account a spec should log in as, or why it has none.
 *
 * @param {?LiveAccounts} accounts from {@link parseLiveAccounts}
 * @param {'pro'|'pending'|'free'} role
 * @param {string} project the Playwright project name
 * @return {{account: ?LiveAccount, skip: ?string}} exactly one is non-null
 */
export function accountFor(accounts, role, project) {
  if (!accounts) {
    return {account: null, skip: `${VAR} is not set or not usable`}
  }
  if (role === 'free') {
    const account = accounts.free[project]
    return account ?
      {account, skip: null} :
      {account: null, skip: `${VAR} has no free account for project "${project}"`}
  }
  const account = role === 'pro' ? accounts.pro : accounts.pending
  return account ? {account, skip: null} : {account: null, skip: `${VAR} has no ${role} account`}
}


/**
 * @param {*} entry
 * @param {string} path e.g. 'pro', 'free.webkit'
 * @return {?string} what is wrong with it, or null
 */
function accountProblem(entry, path) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return `${VAR}.${path} must be an object with email and password`
  }
  if (typeof entry.email !== 'string' || entry.email.trim() === '') {
    return `${VAR}.${path}.email must be a non-empty string`
  }
  if (!/^[^@\s]+@[^@\s]+$/.test(entry.email)) {
    return `${VAR}.${path}.email must be an email address`
  }
  if (typeof entry.password !== 'string' || entry.password === '') {
    return `${VAR}.${path}.password must be a non-empty string`
  }
  return null
}


/**
 * @param {string} problem
 * @return {{accounts: null, problem: string}}
 */
function refuse(problem) {
  return {accounts: null, problem}
}
