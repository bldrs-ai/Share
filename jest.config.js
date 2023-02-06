/**
 * TODO(pablo): this is a work-around for jest not understanding es6
 * modules.  I don't really understand the problem, just that this
 * works.
 */
const esModules = [
  '@bldrs-ai',
  'bail',
  'comma-separated-tokens',
  'decode-named-character-reference',
  'hast-util-whitespace',
  'is-plain-obj',
  'mdast-util-definitions',
  'mdast-util-from-markdown',
  'mdast-util-to-hast',
  'mdast-util-to-string',
  'micromark',
  'property-information',
  'space-separated-tokens',
  'remark-rehype',
  'react-markdown',
  'remark-parse',
  'three',
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
  testPathIgnorePatterns: [
    'src/Share.test.js',
  ],
  transform: {
    '\\.[jt]sx?$': 'babel-jest',
    '^.+\\.svg$': '<rootDir>/svgTransform.js',
  },
  transformIgnorePatterns: [
    `/node_modules/(?!${esModules}/)`,
  ],
  moduleNameMapper: {
    '^.+\\.css$': 'identity-obj-proxy',
  },
  setupFilesAfterEnv: [
    '<rootDir>/src/setupTests.js',
    '@alex_neo/jest-expect-message',
  ],
}
