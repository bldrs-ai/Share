import {defineConfig, devices} from '@playwright/test'


const isCI = !!process.env.CI

console.warn('isCI', isCI)

export default defineConfig({
  // Look for test files in the "src" directory, relative to this configuration file.
  testDir: '../src',

  testMatch: [
    // 'Components/Profile/theme.spec.ts',
    'routes/routes.spec.ts',
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
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'on-first-retry',
  },

  // Configure projects for major browsers.
  projects: [
    {
      name: 'chromium',
      use: {...devices['Desktop Chrome']},
    },
  ],
  // Run your local dev server before starting the tests.
  webServer: {
    command: isCI ? `yarn test-flows-build-and-serve` : `yarn test-flows-serve`,
    url: 'http://localhost:8080',
    env: {
      SHARE_CONFIG: 'playwright',
    },
    // Don't try to use existing server on GHA.  Locally will lazy start with command
    // above if none is running.
    reuseExistingServer: !isCI,
  },
})
