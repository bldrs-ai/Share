global.TextEncoder = global.TextEncoder || require('util').TextEncoder
global.TextDecoder = global.TextDecoder || require('util').TextDecoder

/**
 * TODO(pablo): this is a work-around for jest not understanding es6
 * modules.  I don't really understand the problem, just that this
 * works.
 */
const esModules = [
  '@bldrs-ai',
  '@popperjs/core',
  'bail',
  'bim-fragment',
  'comma-separated-tokens',
  'decode-named-character-reference',
  'hast-util-whitespace',
  'is-plain-obj',
  'mdast-util-definitions',
  'mdast-util-from-markdown',
  'mdast-util-to-hast',
  'mdast-util-to-string',
  'micromark',
  'n8ao',
  'openbim-clay',
  'openbim-components',
  'property-information',
  'space-separated-tokens',
  'remark-rehype',
  'react-markdown',
  'remark-parse',
  'three',
  'top-tool-package-reader',
  'trim-lines',
  'trough',
  'unified',
  'unist-builder',
  'unist-util-generated',
  'unist-util-is',
  'unist-util-position',
  'unist-util-stringify-position',
  'unist-util-visit',
  'uuid',
  'vfile',
  'vfile-message',
  'web-ifc',
  'web-ifc-three',
  'web-ifc-viewer',
  'use-double-tap',
].join('|')


module.exports = {
  verbose: false,
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: [],
  rootDir: '../../',
  roots: ['<rootDir>/src', '<rootDir>/__mocks__'],
  transform: {
    '\\.[jt]sx?$': 'babel-jest',
    '^.+\\.svg$': '<rootDir>/tools/jest/svgTransform.js',
  },
  transformIgnorePatterns: [
    `/node_modules/(?!${esModules}/)`,
  ],
  moduleNameMapper: {
    '^.+\\.css$': 'identity-obj-proxy',
    // https://github.com/dexie/Dexie.js/issues/1601
    '^dexie$': require.resolve('dexie'),
  },
  setupFilesAfterEnv: [
    '<rootDir>/tools/jest/setupTests.js',
    '@alex_neo/jest-expect-message',
  ],
}
