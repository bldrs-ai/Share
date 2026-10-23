import {FREE_EXPORT_LIMIT, FREE_EXPORT_WINDOW_DAYS} from '../../src/export/freeExports.js'
import {FREE_PRIVATE_MODEL_LIMIT, ROLLING_WINDOW_DAYS} from '../../src/quota/limits.js'
import {PLANS, buildPlans} from '../../marketing/src/lib/pricingPlans.mjs'


// A drift tripwire for the pricing page's quota copy. PLANS
// (marketing/src/lib/pricingPlans.mjs) is the only place that copy lives, and
// it builds its allowances from the enforced constants (src/quota/limits.js
// for private models, src/export/freeExports.js for GLB exports), so the
// numbers can't drift by construction. This pins the rest: that the Free
// account plan states both allowances, that Pro says unlimited, that no plan
// limits local files (Share#1966: free and unmetered), and that nobody
// replaced a generated claim with a literal.
//
// It checks the data, not the rendered page (codex review on Share#1971 went
// two rounds on HTML parsing; the coordinator called it over-built for a
// tripwire). PricingTiers.tsx renders PLANS and states no limit of its own;
// the page's header, enterprise and FAQ copy are reviewed by hand.


// Each allowance as the page must word it, from the constants the viewer
// enforces. Spelled out here rather than imported from pricingPlans.mjs, so a
// change to how PLANS words them can't make this agree with itself.
const WINDOW_WORDS = {7: 'week', 30: 'month'}
const freePrivateModelsClaim = (n, days) => `${n} private models a ${WINDOW_WORDS[days]}`
const freeExportsClaim = (n, days) => `${n} GLB exports a ${WINDOW_WORDS[days]}`

// Local files are free and unmetered: any limit wording beside local-file
// wording in one plan entry is a claim the viewer doesn't enforce.
const LOCAL_WORDS = /\b(?:local|your computer|drag and drop|uploads?|uploaded)\b/i
const LIMIT_WORDS =
  /\b(?:\d+|limit(?:s|ed)?|max(?:imum)?|up to|quota|metered|capped|per\s+(?:day|week|month|year)|a\s+(?:day|week|month|year))\b/i

// Any count of models, files, exports or loads, with its window when it has
// one. Each must equal one of the two generated claims EXACTLY, window
// included: a prefix match let "2 GLB exports a month" through beside the
// real weekly claim (codex review on Share#1971).
const COUNTED_PHRASE =
  /\b\d+\s+(?:\w+\s+){0,2}(?:models?|files?|exports?|uploads?|loads?)\b(?:\s+(?:a|per|every|each)\s+\w+|\s*\/\s*\w+)?/gi


/**
 * @param {object} plan
 * @return {Array<string>} every string the plan puts on the page
 */
function planCopy(plan) {
  return [
    plan.name,
    plan.description,
    plan.badge,
    // The button label renders too (codex review on Share#1971).
    plan.cta,
    ...plan.sections.flatMap((section) => [section.heading, ...section.features]),
  ].filter((text) => typeof text === 'string')
}


/**
 * Every way the plans' quota copy can be untrue, as readable strings.
 *
 * @param {Array<object>} plans
 * @param {{models: string, exports: string}} expected the two claims, worded
 *   from the allowances they should state
 * @return {Array<string>}
 */
function planProblems(plans, expected) {
  const problems = []
  const byName = new Map(plans.map((plan) => [plan.name, planCopy(plan)]))
  const freeAccount = byName.get('Free account') || []
  const pro = byName.get('Share Pro') || []
  for (const claim of [expected.models, expected.exports]) {
    if (!freeAccount.some((text) => text.includes(claim))) {
      problems.push(`Free account doesn't state "${claim}"`)
    }
  }
  for (const claim of ['Unlimited private models', 'Unlimited GLB exports']) {
    if (!pro.includes(claim)) {
      problems.push(`Share Pro doesn't state "${claim}"`)
    }
  }
  for (const [name, copy] of byName) {
    for (const text of copy) {
      if (LOCAL_WORDS.test(text) && LIMIT_WORDS.test(text)) {
        problems.push(`${name}: limit on local files, which are unmetered: "${text}"`)
      }
      for (const [phrase] of text.matchAll(COUNTED_PHRASE)) {
        if (phrase !== expected.models && phrase !== expected.exports) {
          problems.push(`${name}: a count the viewer doesn't enforce: "${text}"`)
        }
      }
    }
  }
  return problems
}


const ENFORCED = {
  models: freePrivateModelsClaim(FREE_PRIVATE_MODEL_LIMIT, ROLLING_WINDOW_DAYS),
  exports: freeExportsClaim(FREE_EXPORT_LIMIT, FREE_EXPORT_WINDOW_DAYS),
}


/**
 * PLANS with one feature string replaced, as a hand edit would.
 *
 * @param {string} from
 * @param {string} to
 * @return {Array<object>}
 */
function editPlans(from, to) {
  const edited = JSON.parse(JSON.stringify(PLANS))
  const sections = edited.flatMap((plan) => plan.sections)
  expect(sections.flatMap((section) => section.features).filter((f) => f.includes(from))).toHaveLength(1)
  for (const section of sections) {
    section.features = section.features.map((feature) => feature.replace(from, to))
  }
  return edited
}


describe('marketing pricing plans', () => {
  it('words the enforced allowances: 2 private models a month, 2 GLB exports a week', () => {
    // The owner's numbers (#1970), so a change to a constant is a decision
    // someone sees here, not just copy that silently follows it.
    expect(ENFORCED).toEqual({models: '2 private models a month', exports: '2 GLB exports a week'})
  })

  it('states the enforced allowances, Pro unlimited, and no limit on local files', () => {
    expect(PLANS.map((plan) => plan.name)).toEqual(['Bldrs Share', 'Free account', 'Share Pro'])
    expect(planProblems(PLANS, ENFORCED)).toEqual([])
  })

  // Mutation proofs (STYLE.md §"Assertions must be able to fail").
  it('follows the constants: other allowances produce their own claims', () => {
    const [models, modelDays, exports, exportDays] = [5, FREE_EXPORT_WINDOW_DAYS, 9, ROLLING_WINDOW_DAYS]
    const plans = buildPlans({
      freePrivateModels: models, privateModelWindowDays: modelDays, freeExports: exports, exportWindowDays: exportDays,
    })
    const expected = {models: freePrivateModelsClaim(models, modelDays), exports: freeExportsClaim(exports, exportDays)}
    expect(planProblems(plans, expected)).toEqual([])
    // ...and they are not the enforced ones.
    expect(planProblems(plans, ENFORCED)).not.toEqual([])
  })

  it('fails a hard-coded wrong number in PLANS', () => {
    const problems = planProblems(editPlans('2 private models a month', '3 private models a month'), ENFORCED)
    expect(problems).toEqual(expect.arrayContaining([
      'Free account doesn\'t state "2 private models a month"',
      expect.stringMatching(/a count the viewer doesn't enforce: "Open and share 3 private models a month"/),
    ]))
    expect(planProblems(editPlans('2 GLB exports a week', '4 GLB exports a week'), ENFORCED).join('\n'))
      .toMatch(/doesn't state "2 GLB exports a week"/)
  })

  it('fails a removed claim', () => {
    expect(planProblems(editPlans('Unlimited GLB exports', 'Faster exports'), ENFORCED))
      .toEqual(['Share Pro doesn\'t state "Unlimited GLB exports"'])
  })

  it('fails a limit on local files', () => {
    for (const claim of [
      'Your files never leave your computer, 5 a week',
      'Open local files, up to 3 a month',
      'Drag and drop: limited',
    ]) {
      expect(planProblems(editPlans('Your files never leave your computer', claim), ENFORCED).join('\n'))
        .toMatch(/limit on local files/)
    }
  })

  it('fails an allowance claim with the wrong window anywhere, even beside the right one', () => {
    const edited = editPlans('Unlimited private models', 'Unlimited private models, plus 2 GLB exports a month')
    expect(planProblems(edited, ENFORCED).join('\n'))
      .toMatch(/Share Pro: a count the viewer doesn't enforce: ".*2 GLB exports a month"/)
  })

  it('checks the button label too', () => {
    const edited = JSON.parse(JSON.stringify(PLANS))
    edited.find((plan) => plan.name === 'Free account').cta = 'Get 5 GLB exports'
    expect(planProblems(edited, ENFORCED).join('\n'))
      .toMatch(/Free account: a count the viewer doesn't enforce: "Get 5 GLB exports"/)
  })

  it('fails load-count copy', () => {
    expect(planProblems(editPlans('Connect Google Drive and GitHub', '4 model loads per month'), ENFORCED).join('\n'))
      .toMatch(/a count the viewer doesn't enforce: "4 model loads per month"/)
  })
})
