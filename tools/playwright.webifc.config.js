import {defineConfig, devices} from '@playwright/test'
import {runGetPortPlease} from './utils'


// Separate Playwright config for the web-ifc *engine* smoke. It builds
// with `USE_WEBIFC_SHIM=false` (real web-ifc, not the Conway shim) and
// serves it cross-origin isolated (`serveStaticIsolated.mjs`) — the
// engine path we validate for side-by-side comparison with Conway. The
// build is pinned to web-ifc's single-threaded wasm (0.0.35's MT build
// is unshippable as packaged — see `webIfcSingleThreadPlugin`); the
// isolated serve is retained for Conway's own MT wasm and a future MT
// follow-up. The default config (`playwright.config.js`) ignores
// `*.webifc.spec.ts`, so these never run against the Conway build.
const ciPort = 9091 // distinct from the Conway run's 9081
const isCI = process.env.CI === 'true'
const port = isCI ? ciPort : runGetPortPlease(ciPort)
const url = `http://localhost:${port}`
console.warn('Using web-ifc engine test server:', url)

export default defineConfig({
  testDir: '../src',
  testMatch: ['**/*.webifc.spec.ts'],

  fullyParallel: true,
  retries: isCI ? 1 : 0,
  // One worker: this is a single engine-init smoke — no benefit to
  // parallel pages here.
  workers: 1,
  // web-ifc wasm compile + model parse; generous so a slow CI runner
  // doesn't masquerade as an init failure.
  timeout: 120_000,

  reporter: [
    isCI ? ['github'] : ['list'],
    ['html', {outputFolder: 'playwright-report-webifc', open: 'never'}],
  ],

  use: {
    baseURL: url,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    viewport: {width: 1280, height: 800},
    deviceScaleFactor: 1,
  },

  projects: [
    {
      name: 'chromium',
      use: {...devices['Desktop Chrome']},
    },
  ],

  webServer: {
    command: `yarn test-flows-build-and-serve-webifc ${port}`,
    url,
    timeout: 180_000,
    env: {
      SHARE_CONFIG: 'playwright',
      PORT: `${port}`,
    },
    reuseExistingServer: !isCI,
  },
})
