import {parseSpaAllowlist, isSpaPath, loadSpaAllowlist} from './redirects.js'


describe('parseSpaAllowlist', () => {
  it('extracts splat patterns as prefix matchers', () => {
    const m = parseSpaAllowlist('/share/*  /index.html  200\n')
    expect(isSpaPath('/share/v/p/index.ifc', m)).toBe(true)
    expect(isSpaPath('/share', m)).toBe(true)
    expect(isSpaPath('/share/', m)).toBe(true)
    expect(isSpaPath('/sharex', m)).toBe(false)
  })

  it('extracts literal paths as exact matchers', () => {
    const m = parseSpaAllowlist('/ipsum  /index.html  200\n')
    expect(isSpaPath('/ipsum', m)).toBe(true)
    expect(isSpaPath('/ipsum/', m)).toBe(false)
    expect(isSpaPath('/ipsumish', m)).toBe(false)
  })

  it('ignores comments and blank lines', () => {
    const src = `
# header comment
/share/*  /index.html  200

# another
/ipsum    /index.html  200
`
    const m = parseSpaAllowlist(src)
    expect(m).toHaveLength(2)
  })

  it('skips rules that are not SPA rewrites to /index.html 200', () => {
    const src = `
/share/*       /index.html  200
/old           /new          301
/api/*         /.netlify/functions/api  200
`
    const m = parseSpaAllowlist(src)
    expect(m).toHaveLength(1)
    expect(isSpaPath('/share/foo', m)).toBe(true)
    expect(isSpaPath('/old', m)).toBe(false)
    expect(isSpaPath('/api/x', m)).toBe(false)
  })

  it('strips query and hash before matching', () => {
    const m = parseSpaAllowlist('/share/*  /index.html  200\n')
    expect(isSpaPath('/share/v/p?foo=bar', m)).toBe(true)
    expect(isSpaPath('/share/v/p#section', m)).toBe(true)
  })
})


describe('loadSpaAllowlist (real public/_redirects)', () => {
  const m = loadSpaAllowlist()

  it('routes /share/* to the SPA', () => {
    expect(isSpaPath('/share/v/p/index.ifc', m)).toBe(true)
  })

  it('routes /ipsum, /popup-auth, /popup-callback to the SPA', () => {
    expect(isSpaPath('/ipsum', m)).toBe(true)
    expect(isSpaPath('/popup-auth', m)).toBe(true)
    expect(isSpaPath('/popup-callback', m)).toBe(true)
  })

  it('does not route marketing paths (file-match wins in prod)', () => {
    expect(isSpaPath('/about/', m)).toBe(false)
    expect(isSpaPath('/blog/', m)).toBe(false)
    expect(isSpaPath('/pricing/', m)).toBe(false)
    expect(isSpaPath('/privacy/', m)).toBe(false)
    expect(isSpaPath('/tos/', m)).toBe(false)
    expect(isSpaPath('/services/', m)).toBe(false)
  })

  it('does not route arbitrary unknown paths (soft-404 fix)', () => {
    expect(isSpaPath('/abot', m)).toBe(false)
    expect(isSpaPath('/random-typo', m)).toBe(false)
  })
})
