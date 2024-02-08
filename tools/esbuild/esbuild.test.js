import config from './common.js'


describe('esbuild', () => {
  it('build for prod should be: minified, split, keep names', () => {
    expect(config.format).toBe('esm')
    expect(config.bundle).toBe(true)
    expect(config.minify).toBe(true)
    expect(config.splitting).toBe(false)
    expect(config.keepNames).toBe(true)
    expect(config.sourcemap).toBe(true)
    expect(config.metafile).toBe(true)
    expect(config.logLevel).toBe('info')
  })
})
