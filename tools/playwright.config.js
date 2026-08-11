import {defineConfig, devices} from '@playwright/test'
import {runGetPortPlease} from './utils'


const ciPort = 9081
const isCI = process.env.CI === 'true'
// In CI we use a fixed port.  Locally, there may be multiple instances of this
// process, so it's desired but not assured.
const port = isCI ? ciPort : runGetPortPlease(ciPort)
const url = `http://localhost:${port}`
console.warn('Using test server:', url)

export default defineConfig({
  // Look for test files in the "src" directory, relative to this configuration file.
  testDir: '../src',

  testMatch: [
    '**/*.spec.ts',
  ],

  // The web-ifc engine smoke runs under tools/playwright.webifc.config.js
  // against an isolated USE_WEBIFC_SHIM=false build; it must never run
  // against this (Conway) build, where its assertions are meaningless.
  testIgnore: [
    '**/*.webifc.spec.ts',
  ],

  // Run all tests in parallel.
  fullyParallel: true,

  retries: 1,

  workers: 4,

  // Reporter to use
  reporter: [
    isCI ? ['github'] : ['dot'],
    ['html', {outputFolder: 'playwright-report', open: 'never'}], // create HTML report dir
  ],

  use: {
    // Base URL to use in actions like `await page.goto('/')`.
    baseURL: url,
    // don’t record unless failure
    screenshot: 'on-first-retry',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    viewport: {width: 1280, height: 800},
    deviceScaleFactor: 1,
  },

  // Configure projects for major browsers.
  projects: [
    {
      name: 'chromium',
      use: {
        launchOptions: {
          // Helps reduce platform-specific text AA differences:
          args: [
            '--disable-lcd-text',
            '--disable-font-subpixel-positioning',
            '--force-device-scale-factor=1',
            '--font-render-hinting=none',
          ],
        },
        ...devices['Desktop Chrome'],
      },
    },
  ],

  // Run your local dev server before starting the tests.
  webServer: {
    command: `yarn test-flows-build-and-serve ${port}`,
    url,
    env: {
      SHARE_CONFIG: 'playwright',
      PORT: port,
    },
    // 3 min — webServer.command does the SPA build + marketing build
    // (Next.js install + static export) before npx http-server boots, and
    // a cold cache in CI pushes us past Playwright's 60s default.
    timeout: 180_000,
    // Don't try to use existing server on GHA.  Locally will lazy start with command
    // above if none is running.
    reuseExistingServer: true, // !isCI,
  },

  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      // small safety net for residual AA drift:
      // maxDiffPixels: 30,
      maxDiffPixelRatio: 0.02, // 2%
    },
  },

  snapshotPathTemplate:
    '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
})
