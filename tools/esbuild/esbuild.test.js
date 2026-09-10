import config from './common.js'


describe('esbuild', () => {
  it('build for prod should be: minified, split, drop names', () => {
    expect(config.format).toBe('esm')
    expect(config.bundle).toBe(true)
    expect(config.minify).toBe(true)
    expect(config.splitting).toBe(false)
    // keepNames is off because it breaks three's DRACOLoader worker —
    // see comment in common.js. Sourcemaps still preserve names for
    // debugging.
    expect(config.keepNames).toBe(false)
    expect(config.sourcemap).toBe(true)
    expect(config.metafile).toBe(true)
    expect(config.logLevel).toBe('info')
    expect(config.define['process.env.OPFS_IS_ENABLED']).toBe('true')
  })

  it('keeps real dynamic import syntax, which the pro-module loader needs', () => {
    // Without this, esbuild lowers `import(expr)` (the target list includes
    // firefox62, which predates it) into a `__require` shim that THROWS at
    // runtime — and only for un-analyzable specifiers, i.e. exactly the
    // `blob:` URL `src/export/importModuleFromUrl.js` imports. Nothing in
    // the build fails; the export just never downloads. See common.js.
    expect(config.supported['dynamic-import']).toBe(true)
  })
})
