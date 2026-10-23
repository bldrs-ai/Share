import {readFileSync} from 'node:fs'
import {FREE_EXPORT_LIMIT, FREE_EXPORT_WINDOW_DAYS} from '../../src/export/freeExports.js'
import {FREE_PRIVATE_MODEL_LIMIT, ROLLING_WINDOW_DAYS} from '../../src/quota/limits.js'


// The marketing pricing page is a static Next.js build: it can't import the
// SPA's quota constants at runtime, so its numbers are literals. This keeps
// them true. Every limit the page states must be one the viewer ENFORCES,
// read from the constants the client, `record-load` and `pro-module` share
// (src/quota/limits.js, src/export/freeExports.js). History: from June 2026
// the page sold "2 / 4 model loads per month" that nothing counted (#1965);
// Share#1966 then made local files free and unmetered, which a stray "N
// local files" claim would contradict.
const PRICING_TIERS = new URL('../../marketing/src/components/PricingTiers.tsx', import.meta.url)

/** How the page words a rolling window of N days. */
const WINDOW_WORDS = {7: 'week', 30: 'month'}

// "2 private models a month", "2 private models per month", "2 private models / month"
const PRIVATE_MODEL_CLAIM = /(\d+)\s+private\s+models?\s+(?:a|per|\/)\s*(day|week|month|year)\b/gi

// "2 GLB exports a week", "2 free exports per week"
const EXPORT_CLAIM = /(\d+)\s+(?:free\s+)?(?:GLB\s+)?exports?\s+(?:a|per|\/)\s*(day|week|month|year)\b/gi

// The shape #1965 removed: a count of LOADS. What is metered is distinct
// private models, so load-count copy is wrong whatever its number.
const LOAD_LIMIT_COPY = /\d+\s+(?:private\s+)?(?:model\s+)?loads?\b/i

// A number attached to a model/file/export noun that neither claim above
// recognised, e.g. "4 private models" with no window, "10 models a month".
// Such copy states a limit the checks can't verify, so it fails until it is
// worded as a checked claim.
const ANY_COUNTED_NOUN = /\b\d+\s+(?:\w+\s+){0,2}(?:models?|files?|exports?|uploads?)\b/gi

// Local files are free and unmetered (Share#1966). Any limit wording on the
// same line as local-file wording is a claim the viewer doesn't enforce.
const LOCAL_WORDS = /\b(?:local|your computer|drag and drop|uploads?|uploaded)\b/i
const LIMIT_WORDS = /\b(?:\d+|limit(?:s|ed)?|quota|metered|capped|per\s+(?:day|week|month|year)|a\s+(?:day|week|month|year))\b/i


/**
 * The source with its comments removed, so what is left is code and copy in
 * whatever form it takes: single-, double- or back-quoted strings and JSX
 * text alike. A `//` is only a line comment at the start of a line or after
 * whitespace, so a URL inside a string (`https://`) is left alone.
 *
 * @param {string} source
 * @return {string}
 */
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
}


/**
 * @param {number} days
 * @return {string} the page's word for that window
 */
function windowWord(days) {
  const word = WINDOW_WORDS[days]
  if (!word) {
    throw new Error(`No pricing-page wording for a ${days}-day window: add it to WINDOW_WORDS and the copy`)
  }
  return word
}


/**
 * Every way the copy can be untrue, as readable strings. Empty means the
 * page only claims what is enforced, and claims both enforced allowances.
 *
 * @param {string} source PricingTiers.tsx, or a fixture standing in for it
 * @return {Array<string>}
 */
function pricingCopyProblems(source) {
  const code = withoutComments(source)
  const problems = []
  const checked = new Set()

  const checkClaims = (pattern, label, limit, days) => {
    const claims = [...code.matchAll(pattern)]
    if (claims.length === 0) {
      problems.push(`no ${label} claim found; the page must state "${limit} ${label} a ${windowWord(days)}"`)
    }
    for (const [text, count, unit] of claims) {
      checked.add(text)
      if (Number(count) !== limit || unit.toLowerCase() !== windowWord(days)) {
        problems.push(`"${text}" but the enforced allowance is ${limit} per ${days} days`)
      }
    }
  }
  checkClaims(PRIVATE_MODEL_CLAIM, 'private models', FREE_PRIVATE_MODEL_LIMIT, ROLLING_WINDOW_DAYS)
  checkClaims(EXPORT_CLAIM, 'GLB exports', FREE_EXPORT_LIMIT, FREE_EXPORT_WINDOW_DAYS)

  for (const line of code.split('\n')) {
    if (LOAD_LIMIT_COPY.test(line)) {
      problems.push(`load-count copy: ${line.trim()}`)
    }
    if (LOCAL_WORDS.test(line) && LIMIT_WORDS.test(line)) {
      problems.push(`limit claim about local files, which are unmetered: ${line.trim()}`)
    }
    for (const [text] of line.matchAll(ANY_COUNTED_NOUN)) {
      const isPartOfCheckedClaim = [...checked].some((claim) => claim.startsWith(text))
      if (!isPartOfCheckedClaim) {
        problems.push(`unverified limit: "${text}" in ${line.trim()}`)
      }
    }
  }
  return problems
}


describe('marketing pricing tiers', () => {
  it('states only the limits the viewer enforces', () => {
    expect(pricingCopyProblems(readFileSync(PRICING_TIERS, 'utf8'))).toEqual([])
  })

  // A guard that can't fail guards nothing (STYLE.md §"Assertions must be
  // able to fail"): the real page's claims, each with a wrong number, must
  // be caught.
  it('fails the page with a deliberately wrong number', () => {
    const page = readFileSync(PRICING_TIERS, 'utf8')
    const wrongModels = page.replace(
      PRIVATE_MODEL_CLAIM, (_, n, unit) => `${Number(n) + 1} private models a ${unit}`)
    expect(wrongModels).not.toEqual(page)
    expect(pricingCopyProblems(wrongModels).join('\n')).toMatch(/private models a month" but the enforced/)

    const wrongExports = page.replace(EXPORT_CLAIM, (_, n) => `${Number(n) + 1} GLB exports a week`)
    expect(wrongExports).not.toEqual(page)
    expect(pricingCopyProblems(wrongExports).join('\n')).toMatch(/GLB exports a week" but the enforced/)

    const wrongWindow = page.replace(PRIVATE_MODEL_CLAIM, (_, n) => `${n} private models a week`)
    expect(pricingCopyProblems(wrongWindow).join('\n')).toMatch(/but the enforced allowance/)
  })

  it('fails a page that drops either allowance', () => {
    const problems = pricingCopyProblems(`features: ['Unlimited private models']`)
    expect(problems.join('\n')).toMatch(/no private models claim/)
    expect(problems.join('\n')).toMatch(/no GLB exports claim/)
  })

  it('fails any limit claim about local files', () => {
    const ok = `['${FREE_PRIVATE_MODEL_LIMIT} private models a month', '${FREE_EXPORT_LIMIT} GLB exports a week']`
    for (const claim of [
      `'Open 5 local files a month'`,
      `"Drag and drop up to 3 models"`,
      '`Local files: limited`',
      '<Typography>Uploads per month: 10</Typography>',
      `'Files from your computer, 2 a week'`,
    ]) {
      expect(pricingCopyProblems(`${ok}\n${claim}`).join('\n')).toMatch(/local files|unverified limit/)
    }
    // Saying local files are free is fine; it's a limit that isn't.
    expect(pricingCopyProblems(`${ok}\n'Your files never leave your computer'`)).toEqual([])
  })

  it('fails load-count copy and unverified counts, in any string form, but not in comments', () => {
    const ok = `['${FREE_PRIVATE_MODEL_LIMIT} private models a month', '${FREE_EXPORT_LIMIT} GLB exports a week']`
    for (const form of [
      `features: ['2 model loads per month']`,
      `features: ["4 model loads per month"]`,
      'features: [`10 model loads per month`]',
      '<Typography>25 private model loads</Typography>',
      `'4 private models'`,
    ]) {
      expect(pricingCopyProblems(`${ok}\n${form}`)).not.toEqual([])
    }
    expect(pricingCopyProblems(`${ok}\n// was: 4 model loads per month\n/* 9 local files */ const x = 1`))
      .toEqual([])
  })
})
