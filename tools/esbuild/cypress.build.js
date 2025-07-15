import esbuild from 'esbuild'


esbuild.build({
  // Add both entry points here. ESBuild will output a separate bundle for each.
  entryPoints: ['cypress/fixtures/bldrs-inside-iframe.js'],
  outfile: 'cypress/fixtures/bldrs-inside-iframe-bundle.js',
  format: 'esm',
  platform: 'browser',
  target: ['chrome64', 'firefox62', 'safari11.1', 'edge79', 'es2021'],
  bundle: true,
  minify: false,
  keepNames: true, // TODO: have had breakage without this
  splitting: false,
  metafile: true,
  sourcemap: true,
  logLevel: 'info',
  loader: {
    '.md': 'text',
  },
}).then((result) => {
  // eslint-disable-next-line no-console
  console.log(`Build succeeded.`)
}).catch((err) => {
  console.error(`Build failed:`, err)
  process.exit(1)
})

