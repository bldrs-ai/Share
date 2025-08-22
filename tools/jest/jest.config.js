import {excludedNodeModules} from './common.js'


global.TextEncoder = global.TextEncoder || require('util').TextEncoder
global.TextDecoder = global.TextDecoder || require('util').TextDecoder


export default {
  verbose: false,
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: [],
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
    // Redirect any import of OPFSWorkerRef(.js/ts/tsx) to a stub
  '(?:^|[/\\\\])OPFSWorkerRef(?:\\.(?:js|mjs|ts|tsx))?$':
    '<rootDir>/__mocks__/OPFSWorkerRef.stub.js',
  },
  setupFilesAfterEnv: [
    '<rootDir>/tools/jest/setupTests.js',
    '<rootDir>/tools/jest/setupNodeFetch.cjs',
    '@alex_neo/jest-expect-message',
  ],
}
