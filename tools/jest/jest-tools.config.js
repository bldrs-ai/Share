import {excludedNodeModules} from './common.js'


global.TextEncoder = global.TextEncoder || require('util').TextEncoder
global.TextDecoder = global.TextDecoder || require('util').TextDecoder


export default {
  verbose: false,
  testEnvironment: 'jest-environment-node',
  testPathIgnorePatterns: [],
  rootDir: '../../',
  roots: ['<rootDir>/tools'],
  transform: {
    '^.+\\.svg$': '<rootDir>/tools/jest/svgTransform.js',
  },
  transformIgnorePatterns: [
    `/node_modules/(?!${excludedNodeModules}/)`,
  ],
  moduleNameMapper: {
    '^.+\\.css$': 'identity-obj-proxy',
  },
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'node', 'mjs'],
  setupFilesAfterEnv: [
    '@alex_neo/jest-expect-message',
  ],
}
