import {excludedNodeModules} from './common.js'


export default {
  verbose: false,
  testEnvironment: 'jest-fixed-jsdom',
  rootDir: '../../',
  roots: ['<rootDir>/src', '<rootDir>/__mocks__'],
  // Default jest timeout is 5s. Under default parallel worker load (~N-1 cores),
  // heavy React Testing Library mount tests (CadView, OpenModelControl, Notes,
  // TabbedPanels, useVersions) intermittently blow past 5s and produce flakes
  // that pass in isolation. Individual tests needing more should override via
  // their own arg to it()/test().
  testTimeout: 20000,
  transform: {
    '\\.[jt]sx?$': 'babel-jest',
    '^.+\\.svg$': '<rootDir>/tools/jest/svgTransform.js',
    '\\.md$': '<rootDir>/tools/jest/mdTransform.js',
  },
  testPathIgnorePatterns: [
    '.*\\.spec\\.[jt]s$',
  ],
  transformIgnorePatterns: [
    `/node_modules/(?!${excludedNodeModules}/)`,
    '.*\\.spec\\.[jt]s$',
  ],
  moduleNameMapper: {
    '^.+\\.css$': 'identity-obj-proxy',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'node'],
  // Coverage is opt-in via `yarn test-src --coverage` (or the dedicated
  // `yarn test-coverage` script). When enabled, these settings control
  // what's measured and where reports are written.
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.{test,spec,fixture,stories}.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__mocks__/**',
    '!src/**/__snapshots__/**',
    '!src/tests/**',
    '!src/**/*.testobj.json',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text-summary', 'lcov', 'html'],
  // Ratchet: floors set just below the current measured coverage so normal
  // noise doesn't break the build, but any meaningful regression fails CI.
  // Bump these whenever coverage improves — never lower them.
  coverageThreshold: {
    global: {
      statements: 58,
      branches: 50,
      functions: 67,
      lines: 57,
    },
  },
  setupFilesAfterEnv: [
    '<rootDir>/tools/jest/setupTests.js',
    '<rootDir>/tools/jest/setupNodeFetch.cjs',
    '@alex_neo/jest-expect-message',
  ],
}
