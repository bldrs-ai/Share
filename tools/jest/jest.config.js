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
  setupFilesAfterEnv: [
    '<rootDir>/tools/jest/setupTests.js',
    '<rootDir>/tools/jest/setupNodeFetch.cjs',
    '@alex_neo/jest-expect-message',
  ],
}
