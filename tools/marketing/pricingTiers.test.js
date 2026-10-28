import {FREE_PRIVATE_MODEL_LIMIT, ROLLING_WINDOW_DAYS} from '../../src/quota/limits.js'
import {PLANS, buildPlans} from '../../marketing/src/lib/pricingPlans.mjs'


// A drift tripwire for the pricing page's quota copy. PLANS
// (marketing/src/lib/pricingPlans.mjs) is the only place that copy lives, and
// it builds its allowance from the enforced constants (src/quota/limits.js),
// so the number can't drift by construction. Since 2026-10-27 that one
// allowance — model slots — governs opening AND exporting
// (src/export/exportSlots.js), so there is no export count to state, and
// stating one is drift. This pins the rest: that the Free account plan
// states the allowance and that exports ride on it, that Pro says unlimited
// for both, that no plan limits local files (Share#1966: free and unmetered
// to view), and that nobody replaced a generated claim with a literal.
//
// It checks the data, not the rendered page (codex review on Share#1971 went
// two rounds on HTML parsing; the coordinator called it over-built for a
// tripwire). PricingTiers.tsx renders PLANS and states no limit of its own;
// the page's header, enterprise and FAQ copy are reviewed by hand.


// The allowance as the page must word it, from the constants the viewer
// enforces. Spelled out here rather than imported from pricingPlans.mjs, so a
// change to how PLANS words it can't make this agree with itself.
const WINDOW_WORDS = {7: 'week', 30: 'month'}
const freePrivateModelsClaim = (n, days) => `${n} private models a ${WINDOW_WORDS[days]}`
// The Free account's allowance line, whole: the wording the owner proposed
// with the slot rule (2026-10-27).
const freePrivateModelsLine = (n, days) =>
  `${freePrivateModelsClaim(n, days)} — open, share and export them as often as you like`
const PRO_CLAIM = 'Unlimited private models and exports'

// Local files are free and unmetered to view: any limit wording beside
// local-file wording in one plan entry is a claim the viewer doesn't enforce.
const LOCAL_WORDS = /\b(?:local|your computer|drag and drop|uploads?|uploaded)\b/i
const LIMIT_WORDS =
  /\b(?:\d+|limit(?:s|ed)?|max(?:imum)?|up to|quota|metered|capped|per\s+(?:day|week|month|year)|a\s+(?:day|week|month|year))\b/i

// Any count of models, files, exports or loads, with its window when it has
// one. Each must equal the generated claim EXACTLY, window included: a prefix
// match let "2 GLB exports a month" through beside the real weekly claim
// (codex review on Share#1971). An export count of any kind fails here,
// since exports have no count of their own any more.
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
 * @param {{models: string}} expected the claim, worded from the allowance it
 *   should state
 * @return {Array<string>}
 */
function planProblems(plans, expected) {
  const problems = []
  const byName = new Map(plans.map((plan) => [plan.name, planCopy(plan)]))
  const freeAccount = byName.get('Free account') || []
  const pro = byName.get('Share Pro') || []
  const allowanceLine = freeAccount.find((text) => text.includes(expected.models))
  if (allowanceLine === undefined) {
    problems.push(`Free account doesn't state "${expected.models}"`)
  } else if (!/\bexport/i.test(allowanceLine)) {
    // The slot rule's point: what is inside the allowance exports freely.
    problems.push(`Free account doesn't say its ${expected.models} export freely: "${allowanceLine}"`)
  }
  if (!pro.includes(PRO_CLAIM)) {
    problems.push(`Share Pro doesn't state "${PRO_CLAIM}"`)
  }
  for (const [name, copy] of byName) {
    for (const text of copy) {
      if (LOCAL_WORDS.test(text) && LIMIT_WORDS.test(text)) {
        problems.push(`${name}: limit on local files, which are unmetered: "${text}"`)
      }
      for (const [phrase] of text.matchAll(COUNTED_PHRASE)) {
        if (phrase !== expected.models) {
          problems.push(`${name}: a count the viewer doesn't enforce: "${text}"`)
        }
      }
    }
  }
  return problems
}


const ENFORCED = {models: freePrivateModelsClaim(FREE_PRIVATE_MODEL_LIMIT, ROLLING_WINDOW_DAYS)}


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


/**
 * @param {string} name
 * @return {Array<string>} the plan's feature lines
 */
function featuresOf(name) {
  return PLANS.find((plan) => plan.name === name).sections.flatMap((section) => section.features)
}


describe('marketing pricing plans', () => {
  it('words the enforced allowance: 2 private models a week', () => {
    // The owner's number (#1970; weekly 2026-10-26), so a change to a
    // constant is a decision someone sees here, not just copy that silently
    // follows it.
    expect(ENFORCED).toEqual({models: '2 private models a week'})
  })

  it('reads "2 private models a week — open, share and export them as often as you like", with no export count', () => {
    expect(freePrivateModelsLine(FREE_PRIVATE_MODEL_LIMIT, ROLLING_WINDOW_DAYS))
      .toBe('2 private models a week — open, share and export them as often as you like')
    expect(featuresOf('Free account')).toContain(freePrivateModelsLine(FREE_PRIVATE_MODEL_LIMIT, ROLLING_WINDOW_DAYS))
    // The retired "2 GLB exports a week" line is gone, not reworded.
    expect(featuresOf('Free account').filter((feature) => /GLB exports/i.test(feature))).toEqual([])
    expect(featuresOf('Share Pro')).toEqual([PRO_CLAIM])
  })

  it('states the enforced allowance, Pro unlimited, and no limit on local files', () => {
    expect(PLANS.map((plan) => plan.name)).toEqual(['Bldrs Share', 'Free account', 'Share Pro'])
    expect(planProblems(PLANS, ENFORCED)).toEqual([])
  })

  // Mutation proofs (STYLE.md §"Assertions must be able to fail").
  it('follows the constants: another allowance produces its own claim', () => {
    const MONTH_DAYS = 30
    const models = 5
    const plans = buildPlans({freePrivateModels: models, privateModelWindowDays: MONTH_DAYS})
    expect(planProblems(plans, {models: freePrivateModelsClaim(models, MONTH_DAYS)})).toEqual([])
    // ...and it is not the enforced one.
    expect(planProblems(plans, ENFORCED)).not.toEqual([])
  })

  it('fails a hard-coded wrong number in PLANS', () => {
    const problems = planProblems(editPlans('2 private models a week', '3 private models a week'), ENFORCED)
    expect(problems).toEqual(expect.arrayContaining([
      'Free account doesn\'t state "2 private models a week"',
      expect.stringMatching(/a count the viewer doesn't enforce: "3 private models a week/),
    ]))
    // ...and the old monthly wording, now a window the viewer doesn't enforce.
    expect(planProblems(editPlans('2 private models a week', '2 private models a month'), ENFORCED).join('\n'))
      .toMatch(/a count the viewer doesn't enforce: "2 private models a month/)
  })

  it('fails the retired export cap if it comes back, in any wording', () => {
    for (const claim of ['2 GLB exports a week', '5 exports per month', 'Connect GitHub, plus 2 exports a week']) {
      expect(planProblems(editPlans('Connect Google Drive and GitHub', claim), ENFORCED).join('\n'))
        .toMatch(/a count the viewer doesn't enforce/)
    }
  })

  it('fails an allowance line that no longer says its models export freely', () => {
    expect(planProblems(editPlans(' — open, share and export them as often as you like', ''), ENFORCED))
      .toEqual(['Free account doesn\'t say its 2 private models a week export freely: "2 private models a week"'])
  })

  it('fails a removed Pro claim', () => {
    expect(planProblems(editPlans(PRO_CLAIM, 'Unlimited private models'), ENFORCED))
      .toEqual([`Share Pro doesn't state "${PRO_CLAIM}"`])
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
    const edited = editPlans(PRO_CLAIM, `${PRO_CLAIM}, plus 2 private models a month`)
    expect(planProblems(edited, ENFORCED).join('\n'))
      .toMatch(/Share Pro: a count the viewer doesn't enforce: ".*2 private models a month"/)
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
