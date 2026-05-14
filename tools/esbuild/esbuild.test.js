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
})
