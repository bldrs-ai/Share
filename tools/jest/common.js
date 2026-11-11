/**
 * TODO(pablo): this is a work-around for jest not understanding es6
 * modules.  I don't really understand the problem, just that this
 * works.
 */
export const excludedNodeModules = [
  '@bldrs-ai',
  // Scoped to the two subpackages the batched-native GLB writer imports
  // (they pull the ESM-only `property-graph`). Deliberately NOT the whole
  // org: transforming `@gltf-transform/functions` changes how the DRACO
  // compression path resolves and its glbCompress test times out.
  '@gltf-transform/core',
  '@gltf-transform/extensions',
  'bail',
  'character-entities',
  'comma-separated-tokens',
  'decode-named-character-reference',
  'hast-util-whitespace',
  'is-plain-obj',
  'meshoptimizer',
  'mdast-util-definitions',
  'mdast-util-from-markdown',
  'mdast-util-to-hast',
  'mdast-util-to-string',
  'micromark',
  'property-graph',
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
  'use-double-tap',
].join('|')


/**
 * The `transformIgnorePatterns` entry that leaves `excludedNodeModules` to be
 * transformed and skips the rest of node_modules.
 *
 * bunfig.toml's isolated linker stores each package once, at
 * `node_modules/.bun/<name>@<version>/node_modules/<name>/`, and jest matches
 * against that real path. The lookahead therefore lets `.bun/` through, so the
 * pattern is decided at the inner `/node_modules/<name>/`: a package listed
 * above is transformed wherever it is stored, anything else is still ignored
 * there. Without the `.bun/` arm the first `/node_modules/` of every store
 * path matches and three, conway, uuid… reach jest as untransformed ESM.
 */
export const transformIgnoreNodeModules = `/node_modules/(?!\\.bun/|${excludedNodeModules}/)`
