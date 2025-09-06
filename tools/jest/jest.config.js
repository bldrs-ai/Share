import {excludedNodeModules} from './common.js'


export default {
  verbose: false,
  testEnvironment: 'jest-fixed-jsdom',
  testPathIgnorePatterns: [
    '<rootDir>/src/.*\\.spec\\.(ts|js)$', // Exclude Playwright spec files in src/
  ],
  rootDir: '../../',
  roots: ['<rootDir>/src', '<rootDir>/__mocks__'],
  transform: {
    '\\.[jt]sx?$': 'babel-jest',
    '^.+\\.svg$': '<rootDir>/tools/jest/svgTransform.js',
    '\\.md$': '<rootDir>/tools/jest/mdTransform.js',
  },
  transformIgnorePatterns: [
    `/node_modules/(?!${excludedNodeModules}/)`,
  ],
  moduleNameMapper: {
    '^.+\\.css$': 'identity-obj-proxy',
  },
  setupFilesAfterEnv: [
    '<rootDir>/tools/jest/setupTests.js',
    '<rootDir>/tools/jest/setupNodeFetch.cjs',
    '@alex_neo/jest-expect-message',
  ],
}
