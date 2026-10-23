import {readFileSync} from 'node:fs'
import {flags} from '../../src/FeatureFlags.js'


// The marketing pricing page is a static Next.js build and can't read the
// SPA's feature flags, so nothing at runtime keeps its copy honest about what
// the viewer enforces. This pins the one claim that drifted: the page
// advertised "2 / 4 model loads per month" from June 2026 while the `quotas`
// flag (which gates ENFORCEMENT, src/FeatureFlags.js) stayed off, so the
// limit it sold against was never applied.
const PRICING_TIERS = new URL('../../marketing/src/components/PricingTiers.tsx', import.meta.url)

// Matches load-limit copy in any of the shapes it has taken ("2 model loads
// per month", "25 model loads per month") or plausibly would ("4 loads /
// month", "10 private model loads").
const LOAD_LIMIT_COPY = /\d+\s+(?:private\s+)?(?:model\s+)?loads?\b/i


/**
 * The source with its comments removed, so what is left is code and copy in
 * whatever form it takes: single-, double- or back-quoted strings and JSX
 * text alike. The explanatory comment in PricingTiers.tsx names the removed
 * copy and must not trip the check. A `//` is only a line comment at the
 * start of a line or after whitespace, so a URL inside a string (`https://`)
 * is left alone.
 *
 * @param {string} source
 * @return {string}
 */
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
}


describe('marketing pricing tiers', () => {
  const quotas = flags.find((flag) => flag.name === 'quotas')

  it('has a quotas flag to check against', () => {
    expect(quotas).toBeDefined()
  })

  // When `quotas` is flipped on, this test steps aside: the copy may then
  // return, and must match src/quota/quota.js LIMITS (see the comment in
  // PricingTiers.tsx where it was removed).
  const itWhileQuotasOff = quotas && quotas.isActive ? it.skip : it
  itWhileQuotasOff('advertises no model-load limit while quota enforcement is off', () => {
    const offending = withoutComments(readFileSync(PRICING_TIERS, 'utf8'))
      .split('\n')
      .filter((line) => LOAD_LIMIT_COPY.test(line))
    expect(offending).toEqual([])
  })

  // The check has to see copy in every form the file could hold it, not just
  // the single-quoted literals it uses today (codex review on Share#1965).
  it('finds load-limit copy in any string form, and not in comments', () => {
    const forms = [
      `features: ['2 model loads per month']`,
      `features: ["4 model loads per month"]`,
      'features: [`${n} loads per month`, `10 model loads per month`]',
      '<Typography>25 private model loads</Typography>',
    ]
    for (const form of forms) {
      expect(withoutComments(form)).toMatch(LOAD_LIMIT_COPY)
    }
    expect(withoutComments('// was: 2 model loads per month\n/* 4 model loads */ const x = 1'))
      .not.toMatch(LOAD_LIMIT_COPY)
  })
})
