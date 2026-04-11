import {excludedNodeModules} from './common.js'


export default {
  verbose: false,
  testEnvironment: 'jest-fixed-jsdom',
  rootDir: '../../',
  roots: ['<rootDir>/src', '<rootDir>/__mocks__'],
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
      statements: 56,
      branches: 48,
      functions: 66,
      lines: 54,
    },
  },
  setupFilesAfterEnv: [
    '<rootDir>/tools/jest/setupTests.js',
    '<rootDir>/tools/jest/setupNodeFetch.cjs',
    '@alex_neo/jest-expect-message',
  ],
}
