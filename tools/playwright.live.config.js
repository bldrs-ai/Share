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

// Firefox on a GitHub Linux runner has no GPU, and #1942's second CI run
// showed it refusing WebGL outright: "WebGL creation failed: * AllowWebgl2:false
// restricts context creation on this system", then three.js's "A WebGL
// context could not be created", then the app's ErrorBoundary ("Oh no!")
// on every spec that loads a model. (The product's silent crash without
// WebGL is #659; this only keeps the smoke from tripping on the runner.)
//
// The message is Firefox's graphics blocklist saying no to this
// driver/environment, not a missing feature, so the prefs below override the
// blocklist and let Mesa's software rasteriser (llvmpipe) serve the context.
// Kept to the minimum; none of this was runnable where it was written (the
// Firefox download is blocked there), so the next CI run is its test. If
// WebGL2 is still refused, the run's WebGL diagnostics will say so, and the
// next knobs are `gfx.webrender.software: true` and LIBGL_ALWAYS_SOFTWARE=1
// in the workflow's environment.
const FIREFOX_USER_PREFS = {
  // The blocklist override, and the one pref that matters: community reports
  // of this exact "restricts context creation" message on blocklisted or
  // virtualised drivers are fixed by it (Mozilla support threads; three.js
  // forum "FireFox on Windows: WebGL creation failed").
  'webgl.force-enabled': true,
  // Both default to the values given; stated so a runner image or a future
  // Playwright Firefox profile that flips them cannot silently turn WebGL
  // (or its WebGL2 half, which three.js r163+ requires) back off.
  'webgl.disabled': false,
  'webgl.enable-webgl2': true,
}

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
      ...(name === 'firefox' ? {launchOptions: {firefoxUserPrefs: FIREFOX_USER_PREFS}} : {}),
    },
  })),
})
