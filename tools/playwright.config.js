import {defineConfig, devices} from '@playwright/test'


const isCI = !!process.env.CI

export default defineConfig({
  // Look for test files in the "src" directory, relative to this configuration file.
  testDir: '../src',

  testMatch: [
    '**/*.spec.ts',
    // For now just run tests that have been moved over to src
    // 'tests/**/*.spec.ts',
  ],

  // Run all tests in parallel.
  fullyParallel: true,

  retries: 1,

  workers: 4,

  // Reporter to use
  reporter: [['list']], // just list, no HTML

  use: {
    // Base URL to use in actions like `await page.goto('/')`.
    baseURL: 'http://localhost:8080',
    // don’t record unless failure
    trace: 'off',
    video: 'off',
    screenshot: 'off',
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
    command: 'yarn test-flows-serve',
    url: 'http://localhost:8080',
    env: {
      SHARE_CONFIG: 'playwright',
    },
    // True: use the dev server you start separately
    // False: playwright will start its own with `yarn dev`
    reuseExistingServer: !isCI,
  },
})
