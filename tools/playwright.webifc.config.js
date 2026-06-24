import {defineConfig, devices} from '@playwright/test'
import {runGetPortPlease} from './utils'


// Separate Playwright config for the web-ifc *engine* smoke. It builds
// with `USE_WEBIFC_SHIM=false` (real web-ifc, not the Conway shim) and
// serves cross-origin isolated (`serveStaticIsolated.mjs`) so web-ifc
// selects its multi-threaded wasm — the engine path we're validating
// for side-by-side comparison with Conway. The default config
// (`playwright.config.js`) ignores `*.webifc.spec.ts`, so these never
// run against the Conway build.
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
  // One worker: a single engine-init smoke, and MT web-ifc spins up its
  // own pthread pool — no benefit to parallel pages here.
  workers: 1,
  // web-ifc wasm compile + MT worker bootstrap + model parse; generous
  // so a slow CI runner doesn't masquerade as an init failure.
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
