import {readFile} from 'node:fs/promises'
import {APIRequestContext, BrowserContext, Download, Locator, Page, Request, Response, TestInfo, expect, test} from '@playwright/test'
import {DATABASE_CONNECTION} from '../../../../tools/live-smoke/auth0Management.js'
import {captureGlbLogs, glbLinesSinceReset} from '../glbLogs'
import {waitForModelReady} from '../models'
import {containerHeader} from './glbBytes'
import {
  OpfsState,
  RenderState,
  artifactVerdict,
  describeArtifactFailure,
  describeModelNotReady,
  describeNavigationFailure,
  opfsSkipReason,
  pushDiagnostic,
  webglSkipReason,
} from './loadDiagnosis'
import {isCallbackUrl, loginCompletion} from './loginCompletion'
import {
  LiveAdmin,
  LiveTarget,
  accountFor,
  allowedLoginHosts,
  freeTierFromProbe,
  liveAdminFrom,
  liveTargetFrom,
  loginPageProblem,
  parseLiveAccounts,
} from './liveEnv'


/**
 * Playwright-side plumbing for the live smoke specs (`*.live.spec.ts`, run
 * by `tools/playwright.live.config.js`): deciding whether a spec can run at
 * all, logging a real Auth0 account in, and the network and OPFS
 * observations the specs assert on.
 *
 * Unlike the mocked suite's `utils.ts#homepageSetup`, nothing here blocks
 * the network — the deploy, Auth0 and the Netlify Functions are the subject.
 *
 * Design: design/new/live-browser-smoke.md.
 */


/** The model every live spec loads: `public/index.ifc`, which every deploy serves. */
export const LIVE_MODEL_PATH = '/share/v/p/index.ifc'
/**
 * `export` turns the Export tab on where it is still flagged off (main before
 * #1939) and is a no-op where it is on by default, so one URL serves both.
 */
export const LIVE_MODEL_URL = `${LIVE_MODEL_PATH}?feature=export`
export const PRO_MODULE_URL = /\/\.netlify\/functions\/pro-module\?name=glbExport$/
export const RECORD_EXPORT_URL = /\/\.netlify\/functions\/record-export$/

export const HTTP_OK = 200
export const HTTP_UNAUTHORIZED = 401
export const HTTP_FORBIDDEN = 403
export const HTTP_METHOD_NOT_ALLOWED = 405

// A live load crosses the internet: the deploy, Auth0, the conway wasm. The
// mocked suite's budgets assume localhost.
export const LIVE_TEST_TIMEOUT_MS = 240_000
const MODEL_READY_TIMEOUT_MS = 90_000

/**
 * `page.goto` of the model URL. Playwright's default is no limit at all
 * (`navigationTimeout: 0`), so a document request that never answers held a
 * spec until its 240s test timeout and then surfaced as a bare
 * `net::ERR_ABORTED` (#1942, run 37726235368). A healthy deploy answers in
 * seconds; this is generous for a cold Netlify preview over the internet.
 */
const NAVIGATION_TIMEOUT_MS = 60_000
const ABORTED_BY_TEARDOWN = 'net::ERR_ABORTED'
const WRITER_TIMEOUT_MS = 90_000
const LOGIN_TIMEOUT_MS = 45_000
const SESSION_POLL_MS = 250
const ARTIFACT_POLL_MS = 250
// The OPFS probe's worker gets this long to answer before it is reported as
// silent; it is only run on a failure path, so this never delays a pass.
const OPFS_PROBE_TIMEOUT_MS = 10_000
const ESTIMATE_TIMEOUT_MS = 60_000
// The Auth0 SDK's cache key prefix with `cacheLocation: 'localstorage'`
// (src/Auth0/Auth0ProviderWithHistory.jsx). Entries are
// `@@auth0spajs@@::<clientId>::<audience>::<scope>`; the user entry ends
// `::@@user@@`.
const AUTH0_CACHE_PREFIX = '@@auth0spajs@@::'
// The audience Share asks for (Auth0ProviderWithHistory.jsx), and so the
// token every Netlify Function call carries.
const SHARE_AUDIENCE = 'https://api.github.com/'


export type LiveRole = 'pro' | 'free' | 'pending'
export type LiveSession = {
  target: LiveTarget
  account: {email: string, password: string} | null
  admin: LiveAdmin | null
}


/**
 * Decide whether this spec can run, and skip it — with the reason — when it
 * cannot. Call first thing in the test body.
 *
 * Every missing input is a SKIP naming exactly what is missing, so a run
 * with no secrets reads as a list of skips with reasons rather than a wall
 * of red or, worse, of green. A malformed input is a FAILURE: it can only
 * be a mistake, and turning it into a skip would hide it.
 *
 * @param testInfo the running test's info
 * @param needs what this spec needs beyond `LIVE_BASE_URL`
 * @param needs.role the account tier it logs in as, if any
 * @param needs.admin whether it reads or writes `app_metadata`
 * @param needs.functions whether it calls Netlify Functions directly
 * @return what it needs; never returns when the spec was skipped
 */
export function requireLive(testInfo: TestInfo, needs: {role?: LiveRole, admin?: boolean, functions?: boolean} = {}): LiveSession {
  const {target, skip, problem} = liveTargetFrom(process.env.LIVE_BASE_URL, process.env)
  if (problem !== null) {
    throw new Error(problem)
  }
  if (target === null) {
    test.skip(true, skip ?? 'LIVE_BASE_URL is not set')
    throw new Error('unreachable: skipped')
  }
  if (needs.functions && !target.servesFunctions) {
    test.skip(true, `Not applicable on this target: ${target.hostname} serves no Netlify Functions (a local build)`)
  }
  let account = null
  if (needs.role) {
    if (!target.servesFunctions) {
      test.skip(true, `Not applicable on this target: ${target.hostname} has no real Auth0 or Netlify Functions behind it`)
    }
    const parsed = parseLiveAccounts(process.env.LIVE_SMOKE_ACCOUNTS)
    if (parsed.problem !== null && parsed.problem !== 'LIVE_SMOKE_ACCOUNTS is not set') {
      throw new Error(parsed.problem)
    }
    const found = accountFor(parsed.accounts, needs.role, testInfo.project.name)
    if (found.account === null) {
      test.skip(true, found.skip ?? `no ${needs.role} account`)
    }
    // Credentials are typed only into an allow-listed Auth0 host; with none
    // configured there is nowhere they may go (loginWithPassword).
    const login = allowedLoginHosts(process.env)
    if (login.problem !== null) {
      if (!login.isUnset) {
        throw new Error(login.problem)
      }
      test.skip(true, login.problem)
    }
    account = found.account
  }
  let admin = null
  if (needs.admin) {
    const resolved = liveAdminFrom(process.env)
    if (resolved.problem !== null) {
      throw new Error(resolved.problem)
    }
    if (resolved.admin === null) {
      test.skip(true, resolved.skip ?? 'no Auth0 Management API credentials')
    }
    admin = resolved.admin
  }
  return {target, account, admin}
}


/**
 * Record a check that could not be made on this run, as an annotation the
 * live reporter lists (tools/live-smoke/liveReporter.js). For a sub-check
 * whose precondition the deploy did not offer — never for one that failed.
 *
 * @param testInfo the running test's info
 * @param description what was not checked, and why
 */
export function noteUnverified(testInfo: TestInfo, description: string) {
  testInfo.annotations.push({type: 'unverified', description})
}


/**
 * Mark the visitor as returning, so the first-visit About dialog does not
 * cover the toolbar. `utils.ts#setIsReturningUser` sets it for `localhost`;
 * a live run needs it on the deploy's own host.
 *
 * @param context the browser context
 * @param target the deploy
 */
export async function setReturningVisitor(context: BrowserContext, target: LiveTarget) {
  await context.addCookies([{name: 'isFirstTime', value: '1', domain: target.hostname, path: '/'}])
}


/**
 * Log in with email and password through Auth0's Universal Login, the way
 * Share's own login popup does it, and leave the tokens in this context's
 * localStorage for the next page load to find.
 *
 * Share's login dialog offers only GitHub and Google, but its popup route
 * takes any connection: `/popup-auth?connection=…` calls `loginWithRedirect`
 * and Auth0 returns to `/popup-callback`, where the SDK caches the tokens
 * (`cacheLocation: 'localstorage'`). It is driven in a page of its own
 * because `PopupCallback` ends by calling `window.close()`.
 *
 * Fresh per test, never shared through a saved `storageState`: Share uses
 * rotating refresh tokens, and every page load force-refreshes once
 * (BaseRoutes' fresh-claims pass), so two contexts started from one saved
 * refresh token present it twice — which Auth0 treats as token theft and
 * answers by revoking the whole family, mid-run.
 *
 * **Credentials go only to an allow-listed Auth0 host** (Codex on #1942).
 * The redirect from `/popup-auth` is the target's to choose, so a
 * compromised or wrong target could send this page to any form with a
 * username and a password field. Before the email, and again before the
 * password, the page must be https on exactly a host from
 * `tools/live-smoke/loginHosts.js#allowedLoginHosts`; and each value is set
 * by an evaluate that repeats the check against the document it is writing
 * into, in the same turn, so a navigation between the check and the write
 * cannot redirect it. With no host configured, nothing is typed.
 *
 * @param context the browser context the spec will use
 * @param target the deploy
 * @param account the test account
 */
export async function loginWithPassword(context: BrowserContext, target: LiveTarget, account: {email: string, password: string}) {
  // Fail closed, here as well as in requireLive's skip: no allowed host, no
  // login.
  const {hosts, problem} = allowedLoginHosts(process.env)
  if (problem !== null) {
    throw new Error(`Refusing to log in: ${problem}`)
  }
  const page = await context.newPage()
  // Watched from the start: the page that succeeds is closed by
  // PopupCallback, so these are how the end of the login is known
  // (loginCompletion.ts).
  const signals = {reachedCallback: false, closedAtMs: null as number | null}
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && isCallbackUrl(frame.url(), target.baseUrl)) {
      signals.reachedCallback = true
    }
  })
  page.on('close', () => {
    signals.closedAtMs = Date.now()
  })
  let probe: Page | null = null
  try {
    await page.goto(`${target.baseUrl}/popup-auth?connection=${DATABASE_CONNECTION}`)
    await page.waitForURL((url) => url.origin !== target.baseUrl, {timeout: LOGIN_TIMEOUT_MS})
    await page.waitForLoadState('domcontentloaded')
    assertLoginPage(page, hosts)
    await failOnAuth0ErrorPage(page)
    // New Universal Login names the field `username`; Classic, `email`.
    await enterQuietly(page.locator('input[name="username"], input[name="email"]').first(), account.email, hosts)
    const password = page.locator('input[name="password"]')
    if (!await password.isVisible()) {
      // Identifier-first: the password is on the next screen — which is a
      // navigation, so the page is checked again before anything is typed.
      await page.locator('button[type="submit"]').first().click()
      await password.waitFor({timeout: LOGIN_TIMEOUT_MS})
    }
    assertLoginPage(page, hosts)
    await enterQuietly(password, account.password, hosts)
    await page.locator('button[type="submit"][name="action"], button[type="submit"]').first().click()
    await backOnTargetOrClosed(page, target, (url) => url.pathname.includes('consent'))
    if (!page.isClosed() && new URL(page.url()).pathname.includes('consent')) {
      await page.locator('button[value="accept"]').click()
      await backOnTargetOrClosed(page, target)
    }
    if (!page.isClosed() && new URL(page.url()).origin !== target.baseUrl) {
      await failOnAuth0ErrorPage(page)
      throw new Error('Auth0 did not return to the app after the password step. Check the account\'s password ' +
        `in LIVE_SMOKE_ACCOUNTS, that ${DATABASE_CONNECTION} is enabled for the Share application, and that ` +
        `${target.baseUrl}/popup-callback is an Allowed Callback URL.`)
    }

    // Done when the context holds a session — read from the login page while
    // it lives, and from a probe page on the target's origin once
    // PopupCallback has closed it. A page that closed before the callback,
    // or a callback that cached nothing, fails with that reason.
    const deadline = Date.now() + LOGIN_TIMEOUT_MS
    for (;;) {
      if (page.isClosed() && probe === null) {
        probe = await openSessionProbe(context, target)
      }
      const hasSession = await readCachedSession(page.isClosed() ? probe as Page : page)
      const outcome = loginCompletion({...signals, hasSession, nowMs: Date.now(), deadlinePassed: Date.now() > deadline})
      if (outcome.state === 'done') {
        break
      }
      if (outcome.state === 'failed') {
        throw new Error(`The login did not complete: ${outcome.reason}`)
      }
      await new Promise((resolve) => setTimeout(resolve, SESSION_POLL_MS))
    }
  } finally {
    for (const open of [page, probe]) {
      if (open !== null && !open.isClosed()) {
        await open.close()
      }
    }
  }
}


/**
 * Wait until the login page is back on the target (or at a page `alsoStop`
 * accepts), or has closed — PopupCallback closes it on success, and a
 * `waitForURL` on a closed page only rejects. Either way it returns; the
 * caller reads the page's state.
 *
 * @param page the login page
 * @param target the deploy
 * @param alsoStop another URL to stop at, e.g. Auth0's consent screen
 */
async function backOnTargetOrClosed(page: Page, target: LiveTarget, alsoStop: (url: URL) => boolean = () => false) {
  if (page.isClosed()) {
    return
  }
  await Promise.race([
    page.waitForURL((url) => url.origin === target.baseUrl || alsoStop(url), {timeout: LOGIN_TIMEOUT_MS}),
    page.waitForEvent('close', {timeout: LOGIN_TIMEOUT_MS}),
  ]).catch(() => undefined)
}


/**
 * A page in the login's context, on the target's origin, from which to read
 * the session after the login page has closed. `robots.txt` rather than the
 * app: a static document has the origin's localStorage and runs nothing — the
 * app would start the Auth0 SDK and spend the refresh token.
 *
 * @param context the login's browser context
 * @param target the deploy
 * @return the probe page
 */
async function openSessionProbe(context: BrowserContext, target: LiveTarget): Promise<Page> {
  const probe = await context.newPage()
  await probe.goto(`${target.baseUrl}/robots.txt`, {waitUntil: 'commit', timeout: LOGIN_TIMEOUT_MS})
  return probe
}


/**
 * Throw, typing nothing, unless the page is an allowed Auth0 login page.
 *
 * @param page the login page
 * @param hosts from `allowedLoginHosts`
 */
function assertLoginPage(page: Page, hosts: string[]) {
  const problem = loginPageProblem(page.url(), hosts)
  if (problem !== null) {
    throw new Error(`Refusing to enter credentials: ${problem}. Set LIVE_SMOKE_AUTH0_LOGIN_HOST if Share's ` +
      'login runs on a custom Auth0 domain (design/new/live-browser-smoke.md §"Logging in").')
  }
}


/**
 * Put a value in a form field without it becoming part of the run's record,
 * and only if the field's own document is an allowed login page.
 *
 * `locator.fill` names its value in the step title, which the HTML report
 * prints and CI uploads; an evaluate's arguments are not in the title. The
 * host check is repeated INSIDE the evaluate, against the document the value
 * is written into and in the same turn as the write, because the page can
 * navigate between {@link assertLoginPage} and this call. A field in a frame
 * (where `window.top` is another document, or another origin and throws) is
 * refused too.
 *
 * @param field the input
 * @param value what to enter
 * @param hosts from `allowedLoginHosts`
 */
async function enterQuietly(field: Locator, value: string, hosts: string[]) {
  await field.waitFor({timeout: LOGIN_TIMEOUT_MS})
  await field.evaluate((element, {text, allowed}) => {
    const doc = element.ownerDocument
    const where = doc.location
    let isTop = false
    try {
      isTop = window.top !== null && window.top.document === doc
    } catch {
      isTop = false
    }
    if (!isTop || where.protocol !== 'https:' || where.port !== '' ||
        !allowed.includes(where.hostname.toLowerCase())) {
      throw new Error(`refusing to enter a credential on ${where.protocol}//${where.host}`)
    }
    const input = element as HTMLInputElement
    input.focus()
    input.value = text
    input.dispatchEvent(new Event('input', {bubbles: true}))
    input.dispatchEvent(new Event('change', {bubbles: true}))
  }, {text: value, allowed: hosts})
}


/**
 * @param page a page on Auth0's domain
 */
async function failOnAuth0ErrorPage(page: Page) {
  const body = await page.locator('body').innerText().catch(() => '')
  const known = ['Callback URL mismatch', 'invalid_request', 'unauthorized_client', 'access_denied',
    'connection is not enabled']
  const hit = known.find((needle) => body.includes(needle))
  if (hit) {
    throw new Error(`Auth0 refused the login: "${hit}". See design/new/live-browser-smoke.md §"Owner setup".`)
  }
}


/**
 * @param page any open page on the deploy's origin
 * @return whether the Auth0 SDK has tokens cached, or null when the page
 *   could not be read (it is navigating, or closed under us)
 */
async function readCachedSession(page: Page): Promise<boolean | null> {
  return await page.evaluate((prefix) => Object.keys(window.localStorage)
    .some((key) => key.startsWith(prefix) && !key.endsWith('@@user@@')), AUTH0_CACHE_PREFIX).catch(() => null)
}


/**
 * The access token this context's session holds for Share's audience — what
 * `pro-module` and `record-export` see as the bearer. Read from the SDK's
 * cache rather than minted again, so a forged request carries exactly the
 * token the page would.
 *
 * @param page a page on the deploy's origin
 * @return the access token
 */
export async function sessionAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(({prefix, audience}) => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(prefix) && key.includes(`::${audience}::`)) {
        const entry = JSON.parse(window.localStorage.getItem(key) ?? 'null')
        return entry?.body?.access_token ?? null
      }
    }
    return null
  }, {prefix: AUTH0_CACHE_PREFIX, audience: SHARE_AUDIENCE})
  if (typeof token !== 'string') {
    throw new Error(`no cached access token for ${SHARE_AUDIENCE}`)
  }
  return token
}


/**
 * Open the live model and wait for it, logged in or not.
 *
 * Skips first, through {@link skipUnlessWebGL}, in an engine with no WebGL on
 * this runner: every spec loads the model, and the app cannot render one.
 *
 * @param page the page
 * @param options
 * @param options.isSignedIn wait for the signed-in toolbar first
 * @return the `[glb]` console buffer, capturing from before the navigation
 */
export async function openLiveModel(page: Page, {isSignedIn = false}: {isSignedIn?: boolean} = {}): Promise<string[]> {
  await skipUnlessWebGL(page)
  const glbLogs = captureGlbLogs(page)
  const diagnostics = captureLoadDiagnostics(page)
  await gotoLiveModel(page)
  if (isSignedIn) {
    await expect(page.getByTestId('control-button-profile-icon-authenticated'))
      .toBeVisible({timeout: LOGIN_TIMEOUT_MS})
  }
  try {
    await waitForModelReady(page, MODEL_READY_TIMEOUT_MS)
  } catch (e) {
    // The bare locator timeout is what #1942's first Firefox run reported,
    // three times, with no way to tell a crashed app from a slow load.
    const render = await readRenderState(page).catch(() => null)
    throw new Error(`${(e as Error).message}\n\n${describeModelNotReady(render, diagnostics)}`)
  }
  return glbLogs
}


/**
 * Skip the running test, with the reason, when this browser cannot make a
 * WebGL2 context and is not Chromium (loadDiagnosis.ts#webglSkipReason has
 * the decision and why it is narrow).
 *
 * Probed BEFORE the model is navigated to, on whatever the page holds (a
 * fresh page is `about:blank`): the app crashes to its error boundary
 * without WebGL (#659), and a context is a property of the browser's
 * graphics stack, not of the origin. `getContext` on a throwaway canvas
 * is the same question three.js asks first.
 *
 * @param page a page that has not yet navigated to the model
 */
export async function skipUnlessWebGL(page: Page) {
  const hasWebGL2 = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))
  const engine = page.context().browser()?.browserType().name() ?? 'unknown'
  const reason = webglSkipReason({engine, hasWebGL2})
  if (reason !== null) {
    test.skip(true, reason)
  }
}


/**
 * `page.goto` of the model URL, bounded, and saying which stage stalled
 * when it does not finish.
 *
 * The app cannot be the cause of an aborted `goto`: nothing of it runs until
 * the document commits, and its own route changes are `history` calls that
 * do not cancel a pending navigation (BaseRoutes/ShareRoutes only `navigate`
 * from `/` and `/share`, never from `/share/v/p/index.ifc`). So there is no
 * "settled URL" to wait for here, and a failure is never retried: a deploy
 * that does not serve the page is exactly what this smoke exists to report.
 *
 * @param page the page
 */
async function gotoLiveModel(page: Page) {
  const observed: {status: number | null, failure: string | null} = {status: null, failure: null}
  const isDocument = (request: {isNavigationRequest(): boolean, frame(): unknown}) =>
    request.isNavigationRequest() && request.frame() === page.mainFrame()
  const onResponse = (response: Response) => {
    if (isDocument(response.request())) {
      observed.status = response.status()
    }
  }
  const onFailed = (request: Request) => {
    // ERR_ABORTED is a cancellation (the page closing under a pending
    // navigation), not the network refusing: reproduced locally by pointing
    // a spec at a socket that accepts and never answers, with a test timeout
    // shorter than the goto's. It says nothing about why the request hung.
    const errorText = request.failure()?.errorText ?? null
    if (isDocument(request) && errorText !== ABORTED_BY_TEARDOWN) {
      observed.failure = errorText
    }
  }
  page.on('response', onResponse)
  page.on('requestfailed', onFailed)
  const started = Date.now()
  try {
    await page.goto(LIVE_MODEL_URL, {waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS})
  } catch (e) {
    throw new Error(describeNavigationFailure((e as Error).message, {
      ...observed, pendingMs: Date.now() - started, timeoutMs: NAVIGATION_TIMEOUT_MS,
    }))
  } finally {
    page.off('response', onResponse)
    page.off('requestfailed', onFailed)
  }
}


// Diagnostics per page, so `waitForArtifactWritten` can read what
// `openLiveModel` captured without every spec threading a second buffer.
const DIAGNOSTICS = new WeakMap<Page, string[]>()


/**
 * Capture this page's errors and console errors/warnings, redacted
 * (loadDiagnosis.ts#redactDiagnostic), for a failure message to print. One
 * buffer per page: a second call returns the first's.
 *
 * Console warnings are kept because the loader's OPFS fallback is reported
 * only as a `debug().warn` (`Loader.js`, "OPFS path failed"), and
 * `checkOPFSAvailability()`'s rejection only as a `debug().error`.
 *
 * @param page the page, before it navigates
 * @return the buffer, filled as messages arrive
 */
export function captureLoadDiagnostics(page: Page): string[] {
  const existing = DIAGNOSTICS.get(page)
  if (existing !== undefined) {
    return existing
  }
  const diagnostics: string[] = []
  DIAGNOSTICS.set(page, diagnostics)
  page.on('pageerror', (error) => pushDiagnostic(diagnostics, `pageerror: ${error.name}: ${error.message}`))
  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') {
      pushDiagnostic(diagnostics, `console.${type}: ${msg.text()}`)
    }
  })
  return diagnostics
}


/**
 * Wait for the OPFS artifact the Export button needs: the writer's
 * `[glb] writer: wrote` line.
 *
 * Fails EARLY, with the cause, when the artifact can no longer come — the
 * writer skipped, the app has no OPFS in this context, the loader's OPFS
 * path threw, or the reader never ran at all (loadDiagnosis.ts#artifactVerdict).
 * #1942's first WebKit run burned the full timeout on exactly that last
 * case and reported only "Captured: (none)".
 *
 * Success is still the console line, not a file appearing in OPFS: the
 * writer's line is logged after the write has landed, whereas a file can be
 * listed while it is still being written (OPFS.worker.js, on resolving
 * early), and the specs read the artifact's bytes next.
 *
 * Skips first, through {@link skipUnlessOpfs}, in an engine whose Playwright
 * build has no OPFS: every spec that waits for the artifact is a cache spec
 * (the Export button is enabled by it), so one call here covers them all.
 *
 * @param page the page {@link openLiveModel} loaded
 * @param glbLogs from {@link openLiveModel}
 */
export async function waitForArtifactWritten(page: Page, glbLogs: string[]) {
  await skipUnlessOpfs(page)
  const diagnostics = DIAGNOSTICS.get(page) ?? []
  const appOpfs = await readAppOpfsVerdict(page)
  const started = Date.now()
  for (;;) {
    const glbLines = glbLinesSinceReset(glbLogs)
    const verdict = artifactVerdict({
      glbLines, diagnostics, appOpfs, elapsedMs: Date.now() - started, timeoutMs: WRITER_TIMEOUT_MS,
    })
    if (verdict.state === 'done') {
      return
    }
    if (verdict.state === 'failed') {
      const opfs = await readOpfsState(page).catch(() => null)
      throw new Error(describeArtifactFailure(verdict.reason, {glbLines, opfs, diagnostics}))
    }
    await new Promise((resolve) => setTimeout(resolve, ARTIFACT_POLL_MS))
  }
}


/**
 * Skip the running test, with the reason, when this browser has no OPFS to
 * test the cache with and is not Chromium (loadDiagnosis.ts#opfsSkipReason
 * has the decision and why it is narrow).
 *
 * The probe runs in the page, on the deploy's origin: `navigator.storage`
 * can differ on `about:blank`. Call it after {@link openLiveModel}.
 *
 * @param page a page on the deploy's origin
 */
export async function skipUnlessOpfs(page: Page) {
  const hasGetDirectory = await page.evaluate(() => typeof navigator.storage?.getDirectory === 'function')
  const engine = page.context().browser()?.browserType().name() ?? 'unknown'
  const reason = opfsSkipReason({engine, hasGetDirectory})
  if (reason !== null) {
    test.skip(true, reason)
  }
}


/**
 * @param page a page on the deploy's origin
 * @return the store's `isOpfsAvailable`, or undefined when the store is not exposed
 */
async function readAppOpfsVerdict(page: Page): Promise<boolean | null | undefined> {
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).useStore ?? (window as any).store
    return store?.getState ? store.getState().isOpfsAvailable : undefined
  }).catch(() => undefined)
}


/**
 * What OPFS this page's context really offers, independent of the app:
 * the store's verdict, `getDirectory()`, and a sync-access-handle write from
 * a worker — Safari's only OPFS write path (#1686), and so the one the GLB
 * cache depends on. The probe file is removed again and never parses as a
 * container, so {@link opfsContainers} does not see it.
 *
 * @param page a page on the deploy's origin
 * @return the probe's findings
 */
export async function readOpfsState(page: Page): Promise<OpfsState> {
  const app = await readAppOpfsVerdict(page)
  const probed = await page.evaluate(async (timeoutMs) => {
    const describe = (e: unknown) => {
      const err = e as {name?: string, message?: string} | null
      return `${err?.name ?? 'Error'}: ${err?.message ?? String(e)}`
    }
    let directory = 'ok'
    try {
      await navigator.storage.getDirectory()
    } catch (e) {
      directory = describe(e)
    }
    if (directory !== 'ok') {
      return {directory, syncWrite: 'not tried (no directory)'}
    }
    const source = `onmessage = async () => {
      const name = '__live-smoke-opfs-probe-' + Math.random().toString(36).slice(2)
      try {
        const root = await navigator.storage.getDirectory()
        const file = await root.getFileHandle(name, {create: true})
        const handle = await file.createSyncAccessHandle()
        handle.write(new Uint8Array([1]))
        handle.flush()
        handle.close()
        await root.removeEntry(name)
        postMessage('ok')
      } catch (e) {
        postMessage((e && e.name ? e.name : 'Error') + ': ' + (e && e.message ? e.message : String(e)))
      }
    }`
    const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}))
    try {
      const syncWrite = await new Promise<string>((resolve) => {
        const worker = new Worker(url)
        const timer = setTimeout(() => {
          worker.terminate()
          resolve(`no answer in ${timeoutMs}ms`)
        }, timeoutMs)
        worker.onmessage = (event) => {
          clearTimeout(timer)
          worker.terminate()
          resolve(String(event.data))
        }
        worker.onerror = (event) => {
          clearTimeout(timer)
          worker.terminate()
          resolve(`worker error: ${event.message}`)
        }
        worker.postMessage(null)
      })
      return {directory, syncWrite}
    } catch (e) {
      return {directory, syncWrite: `could not start a worker: ${describe(e)}`}
    } finally {
      URL.revokeObjectURL(url)
    }
  }, OPFS_PROBE_TIMEOUT_MS)
  return {app, ...probed}
}


/**
 * @param page the page whose model never became ready
 * @return what it looks like, and whether a fresh canvas gets WebGL2
 */
async function readRenderState(page: Page): Promise<RenderState> {
  return await page.evaluate(() => {
    const dropzone = document.querySelector('[data-testid="cadview-dropzone"]')
    const canvas = document.createElement('canvas')
    let creationError = ''
    canvas.addEventListener('webglcontextcreationerror', (event) => {
      creationError = (event as WebGLContextEvent).statusMessage
    })
    let webgl2: string
    try {
      const gl = canvas.getContext('webgl2')
      webgl2 = gl === null ?
        `none${creationError ? ` (${creationError})` : ''}` :
        `${gl.getParameter(gl.VENDOR)} / ${gl.getParameter(gl.RENDERER)}`
    } catch (e) {
      webgl2 = `getContext threw: ${(e as Error).message}`
    }
    return {
      url: window.location.href,
      hasDropzone: dropzone !== null,
      modelReady: dropzone?.getAttribute('data-model-ready') ?? null,
      bodyText: document.body?.innerText ?? '',
      webgl2,
    }
  })
}


/**
 * The pending-reauth account's JWT makes BaseRoutes open a "Reauthentication
 * Required" dialog; dismiss it the way a user who means to carry on would.
 *
 * @param page the page
 * @return whether the dialog was there
 */
export async function dismissReauthDialog(page: Page): Promise<boolean> {
  const dialog = page.getByRole('dialog').filter({hasText: 'Reauthentication Required'})
  if (await dialog.count() === 0) {
    return false
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  return true
}


/** One response, reduced to what the specs assert on. */
export type SeenResponse = {url: string, method: string, status: number, headers: Record<string, string>,
  requestBody: string | null, body: Promise<string>}


/**
 * Record every response whose URL matches, from now on.
 *
 * @param page the page
 * @param pattern which URLs
 * @return the list, filled as responses arrive
 */
export function watchResponses(page: Page, pattern: RegExp): SeenResponse[] {
  const seen: SeenResponse[] = []
  page.on('response', (response: Response) => {
    if (!pattern.test(response.url())) {
      return
    }
    const request = response.request()
    seen.push({
      url: response.url(),
      method: request.method(),
      status: response.status(),
      headers: response.headers(),
      requestBody: request.postData(),
      // Read lazily, and never let an unread failure surface as an
      // unhandled rejection: a navigation discards response bodies.
      body: response.text().catch(() => ''),
    })
  })
  return seen
}


/**
 * Click Export and read what lands.
 *
 * @param page the page
 * @return the download, its bytes and its suggested name
 */
export async function clickExportAndDownload(page: Page): Promise<{download: Download, bytes: Uint8Array, name: string}> {
  const downloadPromise = page.waitForEvent('download', {timeout: ESTIMATE_TIMEOUT_MS})
  await page.getByTestId('export-glb-button').click()
  const download = await downloadPromise
  const failure = await download.failure()
  if (failure !== null) {
    throw new Error(`the download failed: ${failure}`)
  }
  const bytes = new Uint8Array(await readFile(await download.path()))
  // The button reads "Exporting…" until the file is handed over. The
  // record-export POST is fire-and-forget after that (useExport.js), so a
  // spec that reads it waits for it on its own.
  await expect(page.getByTestId('export-glb-button')).not.toHaveText('Exporting…', {timeout: ESTIMATE_TIMEOUT_MS})
  return {download, bytes, name: download.suggestedFilename()}
}


/**
 * Every Bldrs container in this context's OPFS, with its header — the
 * cache artifact behind the Export button (§1.1a).
 *
 * @param page a page on the deploy's origin
 * @return one entry per container file
 */
export async function opfsContainers(page: Page): Promise<Array<{path: string, version: number, codec: string | null}>> {
  const files = await page.evaluate(async () => {
    const out: Array<{path: string, head: number[]}> = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- lib.dom lacks the async iterator
    const walk = async (dir: any, prefix: string) => {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'directory') {
          await walk(handle, `${prefix}${name}/`)
        } else {
          const file = await handle.getFile()
          const HEAD_BYTES = 16
          out.push({path: `${prefix}${name}`, head: Array.from(new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer()))})
        }
      }
    }
    await walk(await navigator.storage.getDirectory(), '')
    return out
  })
  const containers = []
  for (const {path, head} of files) {
    const header = containerHeader(Uint8Array.from(head))
    if (header !== null) {
      containers.push({path, ...header})
    }
  }
  return containers
}


/**
 * Which free-tier behaviour the deploy has (`freeTierFromProbe`), from an
 * unauthenticated GET of `record-export`.
 *
 * @param request Playwright's API request context
 * @param target the deploy
 * @return the behaviour, and the status it was read from
 */
export async function probeFreeTier(request: APIRequestContext, target: LiveTarget) {
  const response = await request.get(`${target.baseUrl}/.netlify/functions/record-export`)
  return {tier: freeTierFromProbe(response.status()), status: response.status()}
}


/**
 * Read a user's `app_metadata` fresh from Auth0's primary store.
 *
 * @param admin the harness's Management API client
 * @param userId the Auth0 user id
 * @return the app_metadata, `{}` when unset
 */
export async function appMetadataOf(admin: LiveAdmin, userId: string): Promise<Record<string, unknown>> {
  return (await admin.getUser(userId)).app_metadata ?? {}
}


/**
 * Make this context look like Safari before 16.4, which has no
 * `CompressionStream` (§8 step 9) — in the page AND in the GLB writer's
 * worker.
 *
 * Deleting `window.CompressionStream`, as §8 suggests doing from DevTools,
 * reaches only the page. The cache container is packed in
 * `GlbWriter.worker.js` (`GlbWriterService.js`), whose global still has
 * it, so the writer would go on writing the gzipped v3 container and the
 * fallback §8 asks about would never run. So the `Worker` constructor is
 * wrapped as well: a GlbWriter worker starts from a blob that first takes
 * `CompressionStream` away and then loads the real script — by a static
 * import for a module worker (imports evaluate in order, before the worker
 * takes its first message) and by `importScripts` for the classic build.
 * Only that worker is wrapped: a worker started from a blob sees a `blob:`
 * location, which would break any worker that resolves files against its
 * own URL.
 *
 * `window.__bldrsWrappedWorkers` counts the wraps, so a spec can prove the
 * shim reached the writer rather than assume it.
 *
 * @param context the browser context, before any page loads
 */
export async function withoutCompressionStream(context: BrowserContext) {
  await context.addInitScript(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any
    delete w.CompressionStream
    const prelude = 'self.CompressionStream = undefined;'
    const blobUrl = (source: string) => URL.createObjectURL(new Blob([source], {type: 'text/javascript'}))
    const NativeWorker = w.Worker
    w.__bldrsWrappedWorkers = 0
    w.Worker = class extends NativeWorker {
      /**
       * @param url the worker script
       * @param options Worker options
       */
      constructor(url: string | URL, options?: {type?: string}) {
        const href = new URL(String(url), window.location.href).href
        if (!/GlbWriter\.worker/.test(href)) {
          super(url, options)
          return
        }
        const source = options?.type === 'module' ?
          `import ${JSON.stringify(blobUrl(prelude))};\nimport ${JSON.stringify(href)};\n` :
          `${prelude}\nimportScripts(${JSON.stringify(href)});\n`
        super(blobUrl(source), options)
        w.__bldrsWrappedWorkers++
      }
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * @param page a page started under {@link withoutCompressionStream}
 * @return how many GlbWriter workers the shim wrapped
 */
export async function wrappedWriterWorkers(page: Page): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await page.evaluate(() => (window as any).__bldrsWrappedWorkers ?? 0)
}


/**
 * How many scene-side highlights the current selection produced — the same
 * reading `Share/exportGlb.spec.ts#sceneHighlightCount` takes in the mocked
 * suite. The highlight has no DOM, so it is read off the store, which a
 * production build exposes as `window.useStore` (src/store/useStore.js).
 *
 * @param page the page
 * @return highlighted instances plus selection subsets
 */
export async function sceneHighlightCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any
    const viewer = (w.store ?? w.useStore)?.getState?.()?.viewer
    const model = viewer?.IFC?.context?.items?.ifcModels?.[0]
    let batched = 0
    const walk = (obj: any) => {
      if (obj.isBatchedMesh) {
        batched += obj.userData?.batchedHighlight?.selSet?.size ?? 0
      }
    }
    if (model?.isBatchedMesh) {
      walk(model)
    } else {
      model?.traverse?.(walk)
    }
    return batched + (viewer?._conwaySelectionSubsets?.length ?? 0)
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * Skip every test in the enclosing `describe` when `LIVE_BASE_URL` is unset,
 * decided BEFORE any fixture is built. The in-test skips of
 * {@link requireLive} run after `page` exists, which means after the browser
 * launched — so a run without a target would otherwise need every engine
 * installed just to report that it had nothing to test.
 */
export function skipAllWithoutTarget() {
  test.skip(() => liveTargetFrom(process.env.LIVE_BASE_URL, process.env).skip !== null, 'LIVE_BASE_URL is not set')
}
