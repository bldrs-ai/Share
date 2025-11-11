import {defineConfig, devices} from '@playwright/test'
import {runGetPortPlease} from './utils'


const ciPort = 8080
const isCI = process.env.CI === 'true'
const port = 8080 // isCI ? ciPort : runGetPortPlease()
const url = `http://localhost:${port}`


export default defineConfig({
  // Look for test files in the "src" directory, relative to this configuration file.
  testDir: '../src',

  testMatch: [
    '**/*.spec.ts',
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
    // Don't try to use existing server on GHA.  Locally will lazy start with command
    // above if none is running.
    reuseExistingServer: false, // !isCI,
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
