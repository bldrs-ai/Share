import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
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


// bldrs.dev is held, not served (bldrs-ai/ops#36). Netlify applies the first
// matching rule, so the domain redirects must come before every SPA rewrite,
// or https://bldrs.dev/share/... would be served as a page.
describe('bldrs.dev domain redirect (real public/_redirects)', () => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/_redirects')
  const rules = fs.readFileSync(file, 'utf8').split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/))

  it('sends bldrs.dev and www.bldrs.dev to the same path on bldrs.ai, forced, as the first rules', () => {
    expect(rules.slice(0, 2)).toEqual([
      ['https://bldrs.dev/*', 'https://bldrs.ai/:splat', '301!'],
      ['https://www.bldrs.dev/*', 'https://bldrs.ai/:splat', '301!'],
    ])
  })

  // The dev proxy reads the same file (tools/esbuild/proxy.js): the domain
  // rules must parse as non-SPA rules, skipped quietly, not as SPA paths or
  // as "malformed" lines that warn on every dev-server start.
  it('is skipped quietly by the dev proxy\'s SPA parser', () => {
    // A plain recorder, not jest.spyOn: these tests run as ESM, where the
    // `jest` global isn't defined.
    const warnings = []
    const realWarn = console.warn
    console.warn = (...args) => warnings.push(args)
    try {
      expect(parseSpaAllowlist(rules.slice(0, 2).map((parts) => parts.join(' ')).join('\n'))).toEqual([])
    } finally {
      console.warn = realWarn
    }
    expect(warnings).toEqual([])
  })
})
