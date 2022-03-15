import svgrPlugin from 'esbuild-plugin-svgr'

const entry = 'src/index.jsx'
const buildDir = 'docs'
const build = {
  entryPoints: [entry],
  bundle: true,
  minify: false,
  // Splitting
  // Entry points (our src/index.jsx) are currently not named with
  // cache-busting segments, like index-x84nfi.js, so we should be
  // careful with our caching, i.e. not putting much index.jsx.
  // See:
  //   https://esbuild.github.io/api/#chunk-names
  //   https://github.com/evanw/esbuild/issues/16
  splitting: false,
  outdir: buildDir,
  format: 'esm',
  sourcemap: true,
  target: ['chrome58', 'firefox57', 'safari11', 'edge18'],
  logLevel: 'info',
  plugins: [svgrPlugin()],
}

export {build}
