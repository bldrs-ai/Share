import {defineConfig, devices} from '@playwright/test'


const isCI = !!process.env.CI

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
    ['list'], // nice local output
    ['github'], // annotations in GHA
    ['html', {outputFolder: 'playwright-report', open: 'never'}], // create HTML report dir
  ],

  use: {
    // Base URL to use in actions like `await page.goto('/')`.
    baseURL: 'http://localhost:8080',
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
    command: `yarn test-flows-build-and-serve > build.log 2>&1`,
    url: 'http://localhost:8080',
    env: {
      SHARE_CONFIG: 'playwright',
    },
    // Don't try to use existing server on GHA.  Locally will lazy start with command
    // above if none is running.
    reuseExistingServer: !isCI,
  },

  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      // small safety net for residual AA drift:
      maxDiffPixels: 30,
      maxDiffPixelRatio: 0.001, // 0.1%
    },
  },

  snapshotPathTemplate:
    '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
})
