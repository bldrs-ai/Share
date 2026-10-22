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
    const source = readFileSync(PRICING_TIERS, 'utf8')
    // Only the string literals: the explanatory comment in the file names the
    // removed copy and must not trip the check.
    const literals = source.match(/'(?:[^'\\\n]|\\.)*'/g) || []
    const offending = literals.filter((literal) => LOAD_LIMIT_COPY.test(literal))
    expect(offending).toEqual([])
  })
})
