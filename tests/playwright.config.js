import {defineConfig, devices} from '@playwright/test'


export default defineConfig({
  // Look for test files in the "tests" directory, relative to this configuration file.
  testDir: '..',

  testMatch: [
    'tests/**/*.spec.ts',
    'src/**/*.spec.ts',
  ],

  // Run all tests in parallel.
  fullyParallel: true,

  // Reporter to use
  reporter: [['list']], // just list, no HTML

  use: {
    // Base URL to use in actions like `await page.goto('/')`.
    baseURL: 'http://localhost:8080',
    // don’t record unless failure
    trace: 'retain-on-failure',
    // same for video
    // video: 'retain-on-failure',
    // same for screenshots
    // screenshot: 'only-on-failure',
    // For live debugging
    // launchOptions: {devtools: true},
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
    reuseExistingServer: true,
  },
})
