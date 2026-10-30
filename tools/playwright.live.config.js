import {defineConfig, devices} from '@playwright/test'
import {LIVE_PROJECTS} from './live-smoke/accounts.js'


// Live smoke: the `*.live.spec.ts` specs against a DEPLOYED Share — a
// Netlify deploy preview or production — with real Auth0 accounts and real
// Netlify Functions, in every Playwright engine. The mocked suite
// (`playwright.config.js`) ignores these files; this config runs nothing
// else. Design: design/new/live-browser-smoke.md.
//
//   LIVE_BASE_URL=https://deploy-preview-1939--bldrs-share-prod.netlify.app \
//     yarn test-flows-live [--project=chromium] [spec]
//
// There is no webServer: the target is whatever LIVE_BASE_URL names. Unset,
// every spec skips and says so (tools/live-smoke/liveReporter.js).
const isCI = process.env.CI === 'true'

// One device per project, keyed by the names `LIVE_SMOKE_ACCOUNTS.free`
// uses (tools/live-smoke/accounts.js), so the free account a project logs in
// as is found by the project's own name. Chromium stands in for Chrome and
// Edge, WebKit for Safari; the two mobile profiles are emulation, not
// devices (the residual manual list in the design doc covers real ones).
const DEVICES = {
  'chromium': devices['Desktop Chrome'],
  'firefox': devices['Desktop Firefox'],
  'webkit': devices['Desktop Safari'],
  'mobile-iphone': devices['iPhone 13'],
  'mobile-pixel': devices['Pixel 7'],
}

// Firefox and WebKit on a GitHub Linux runner may have no WebGL at all, and
// then the app crashes on load (the product's silent no-WebGL crash is #659).
// The model-loading specs SKIP there, with that reason, rather than fail for
// the runner's sake (liveSession.ts#skipUnlessWebGL); Chromium never skips.
// Getting Firefox a context is #1947. Three attempts failed and were
// removed: the `webgl.force-enabled` / `webgl.disabled:false` /
// `webgl.enable-webgl2` prefs (still "Exhausted GL driver options"), Mesa
// installed on the runner, and LIBGL_ALWAYS_SOFTWARE=1. The prefs were
// harmless but did nothing, and `webgl.force-enabled` overrides Firefox's
// graphics blocklist, so keeping a no-op that changes what a skip probe sees
// would only muddy the next attempt; #1947 lists what is still untried.

for (const name of LIVE_PROJECTS) {
  if (!DEVICES[name]) {
    throw new Error(`playwright.live.config.js: no device for project ${name}`)
  }
}

export default defineConfig({
  testDir: '../src',
  testMatch: ['**/*.live.spec.ts'],

  // Within a project, one test at a time: a project's free account is spent
  // by its free-tier spec, and the pending account by its one spec, so two
  // tests of one project must never overlap. Projects run side by side —
  // each has its own free account, and the Pro and anonymous specs share
  // nothing that a parallel run can disturb.
  fullyParallel: false,
  workers: isCI ? LIVE_PROJECTS.length : 2,

  // No retries. A retry of the free-tier spec would find the allowance its
  // first attempt spent, and the pending spec's account is single-use per
  // reset. A flake here is a finding to read, not to paper over.
  retries: 0,
  timeout: 240_000,
  expect: {timeout: 20_000},

  reporter: [
    isCI ? ['github'] : ['list'],
    ['html', {outputFolder: 'playwright-report-live', open: 'never'}],
    ['./live-smoke/liveReporter.js'],
  ],
  outputDir: 'test-results-live',

  use: {
    baseURL: process.env.LIVE_BASE_URL?.trim() || undefined,
    acceptDownloads: true,
    // Off in CI: a trace records every request's headers (bearer tokens)
    // and the login form's contents, a video shows the account's email
    // being typed, and live-smoke.yml uploads the report from a public
    // repository. Locally they stay on for failures — the machine is the
    // owner's.
    trace: isCI ? 'off' : 'retain-on-failure',
    video: isCI ? 'off' : 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: LIVE_PROJECTS.map((name) => ({
    name,
    workers: 1,
    use: {
      ...DEVICES[name],
    },
  })),
})
