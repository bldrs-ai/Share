import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'
import {FREE_EXPORT_LIMIT, FREE_EXPORT_WINDOW_DAYS} from '../../src/export/freeExports.js'
import {FREE_PRIVATE_MODEL_LIMIT, ROLLING_WINDOW_DAYS} from '../../src/quota/limits.js'


// The marketing pricing page is a static Next.js build: it can't import the
// SPA's quota constants at runtime, so its numbers are literals. This keeps
// them true. Every limit the page states must be one the viewer ENFORCES,
// read from the constants the client, `record-load` and `pro-module` share
// (src/quota/limits.js, src/export/freeExports.js). History: from June 2026
// the page sold "2 / 4 model loads per month" that nothing counted (#1965);
// Share#1966 then made local files free and unmetered, which a local-file
// limit anywhere on the page would contradict.
//
// It checks what RENDERS, not the source text (codex review on Share#1971):
// a scan of the file is satisfied by a dead string that never reaches the
// page, and misses a claim split across JSX elements. So PricingTiers.tsx
// is compiled with esbuild and rendered with react-dom/server — the whole
// component, PLANS and the JSX around it — and the rendered text is checked
// card by card.
const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const PRICING_TIERS = new URL('../../marketing/src/components/PricingTiers.tsx', import.meta.url)
const MARKETING_TSCONFIG = fileURLToPath(new URL('../../marketing/tsconfig.json', import.meta.url))
const MARKETING_SRC = fileURLToPath(new URL('../../marketing/src/', import.meta.url))
const COMPONENTS_DIR = fileURLToPath(new URL('../../marketing/src/components/', import.meta.url))
const UNDER_TEST = 'pricing-tiers-under-test'

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

// Local files are free and unmetered (Share#1966). Limit wording NEAR
// local-file wording — in the same rendered element or an adjacent one, so
// a label and its value in sibling elements count — is a claim the viewer
// doesn't enforce. Adjacent, not card-wide: the Free card's price ("$0
// /month") is a number but not a limit on its files.
const LOCAL_WORDS = /\b(?:local|your computer|drag and drop|uploads?|uploaded)\b/i
const LIMIT_WORDS =
  /\b(?:\d+|limit(?:s|ed)?|max(?:imum)?|up to|quota|metered|capped|per\s+(?:day|week|month|year)|a\s+(?:day|week|month|year))\b/i
const LOCAL_NEIGHBOURHOOD = 1


/**
 * Compile a PricingTiers.tsx source and render it to static HTML, the way the
 * page's first paint (monthly) shows it.
 *
 * Bundled whole, React and MUI included, and every bare import resolved
 * against the REPO ROOT's node_modules — not marketing/'s, which exists only
 * after a marketing build — so this runs the same in CI's test job as
 * locally. `@/…` goes through marketing's tsconfig paths.
 *
 * @param {string} source PricingTiers.tsx contents, real or mutated
 * @return {Promise<string>} rendered HTML
 */
async function renderPricingTiers(source) {
  const rootNodeModules = {
    name: 'root-node-modules',
    setup(b) {
      b.onResolve({filter: new RegExp(`^${UNDER_TEST}$`)}, () => ({path: UNDER_TEST, namespace: UNDER_TEST}))
      b.onLoad({filter: /.*/, namespace: UNDER_TEST}, () => ({contents: source, loader: 'tsx', resolveDir: COMPONENTS_DIR}))
      // Only the marketing source's own bare imports are redirected; the
      // packages they reach resolve their dependencies normally, nested
      // node_modules included.
      b.onResolve({filter: /^[^./]/}, (args) => {
        const fromMarketing = args.namespace === UNDER_TEST || args.importer.startsWith(MARKETING_SRC)
        if (args.path.startsWith('@/') || args.pluginData?.fromRoot || !fromMarketing) {
          return undefined
        }
        return b.resolve(args.path, {kind: args.kind, resolveDir: ROOT, pluginData: {fromRoot: true}})
      })
    },
  }
  const result = await build({
    stdin: {
      contents: [
        `import {createElement} from 'react'`,
        `import {renderToStaticMarkup} from 'react-dom/server'`,
        `import PricingTiers from '${UNDER_TEST}'`,
        `export const html = renderToStaticMarkup(createElement(PricingTiers))`,
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'js',
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    tsconfig: MARKETING_TSCONFIG,
    define: {'process.env.NODE_ENV': '"production"'},
    logLevel: 'silent',
    plugins: [rootNodeModules],
  })
  // Run the CommonJS bundle just built. Everything but Node's builtins is
  // inside it, so `require` only has those left to find.
  const module = {exports: {}}
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(
    module, module.exports, createRequire(`${ROOT}package.json`))
  return module.exports.html
}


/**
 * The rendered text, as the reader sees it: one string per element, entities
 * decoded, whitespace collapsed.
 *
 * @param {string} html
 * @return {Array<string>}
 */
function textSegments(html) {
  return html
    // Emotion inlines each component's CSS as a <style> element when it
    // renders without a cache provider; that is markup, not copy.
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .split(/<[^>]*>/)
    .map((s) => s
      .replace(/&#x27;|&#39;/g, '\'')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((s) => s.length > 0)
}


/**
 * @param {string} html rendered page
 * @return {{page: Array<string>, cards: Map<string, string>}} every segment,
 *   and each plan card's text keyed by its name
 */
function renderedCopy(html) {
  const cards = new Map()
  for (const chunk of html.split(/(?=<div class="[^"]*MuiCard-root)/).slice(1)) {
    // Each chunk runs from one card's opening tag to the next card's.
    // Keyed by the plan name, the card's <h5> (Typography variant="h5"):
    // not its first text, which is the "Popular" badge on a highlighted plan.
    const name = textSegments((/<h5[^>]*>[\s\S]*?<\/h5>/.exec(chunk) || [''])[0]).join(' ')
    cards.set(name, textSegments(chunk).join(' '))
  }
  return {page: textSegments(html), cards}
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
 * Problems with copy that has no card structure to check: load-count copy,
 * unverifiable counts, local-file limits. Exported to the cases below as a
 * plain function of segments so each shape can be shown failing directly.
 *
 * @param {Array<string>} segments rendered text, one string per element
 * @param {Set<string>} checkedClaims claims already verified against the constants
 * @return {Array<string>}
 */
function copyProblems(segments, checkedClaims = new Set()) {
  const problems = []
  segments.forEach((segment, i) => {
    if (LOAD_LIMIT_COPY.test(segment)) {
      problems.push(`load-count copy: "${segment}"`)
    }
    for (const [text] of segment.matchAll(ANY_COUNTED_NOUN)) {
      if (![...checkedClaims].some((claim) => claim.startsWith(text))) {
        problems.push(`unverified limit: "${text}" in "${segment}"`)
      }
    }
    if (LOCAL_WORDS.test(segment)) {
      const near = segments.slice(Math.max(0, i - LOCAL_NEIGHBOURHOOD), i + LOCAL_NEIGHBOURHOOD + 1)
      const limit = near.find((s) => LIMIT_WORDS.test(s))
      if (limit !== undefined) {
        problems.push(`limit claim about local files, which are unmetered: "${segment}" / "${limit}"`)
      }
    }
  })
  return problems
}


/**
 * Every way the rendered page can be untrue, as readable strings. Empty
 * means it states both enforced allowances, on the Free account card, with
 * the enforced numbers, and no other limit.
 *
 * @param {string} html rendered PricingTiers
 * @return {Array<string>}
 */
function pricingCopyProblems(html) {
  const {page, cards} = renderedCopy(html)
  const problems = []
  const checked = new Set()
  const freeAccount = cards.get('Free account')
  const pro = cards.get('Share Pro')
  if (freeAccount === undefined || pro === undefined) {
    return [`expected "Free account" and "Share Pro" cards, rendered: ${[...cards.keys()].join(', ')}`]
  }

  const checkClaims = (pattern, label, limit, days) => {
    if (![...freeAccount.matchAll(pattern)].length) {
      problems.push(`the Free account card doesn't state "${limit} ${label} a ${windowWord(days)}"`)
    }
    for (const [text, count, unit] of page.join(' ').matchAll(pattern)) {
      checked.add(text)
      if (Number(count) !== limit || unit.toLowerCase() !== windowWord(days)) {
        problems.push(`"${text}" but the enforced allowance is ${limit} per ${days} days`)
      }
    }
  }
  checkClaims(PRIVATE_MODEL_CLAIM, 'private models', FREE_PRIVATE_MODEL_LIMIT, ROLLING_WINDOW_DAYS)
  checkClaims(EXPORT_CLAIM, 'GLB exports', FREE_EXPORT_LIMIT, FREE_EXPORT_WINDOW_DAYS)
  for (const claim of [/unlimited private models/i, /unlimited GLB exports/i]) {
    if (!claim.test(pro)) {
      problems.push(`the Share Pro card doesn't state ${claim}`)
    }
  }
  return [...problems, ...copyProblems(page, checked)]
}


describe('marketing pricing tiers', () => {
  const realSource = readFileSync(PRICING_TIERS, 'utf8')
  const RENDER_TIMEOUT_MS = 60_000

  /**
   * @param {string} from text that must occur in the real source exactly once
   * @param {string} to
   * @return {Promise<Array<string>>} problems with the page rendered from the edit
   */
  async function problemsAfterEdit(from, to) {
    expect(realSource.split(from)).toHaveLength(2)
    return pricingCopyProblems(await renderPricingTiers(realSource.replace(from, to)))
  }

  it('renders three cards and states only the limits the viewer enforces', async () => {
    const html = await renderPricingTiers(realSource)
    expect([...renderedCopy(html).cards.keys()]).toEqual(['Bldrs Share', 'Free account', 'Share Pro'])
    expect(pricingCopyProblems(html)).toEqual([])
  }, RENDER_TIMEOUT_MS)

  // A guard that can't fail guards nothing (STYLE.md §"Assertions must be
  // able to fail"). Each case edits the REAL page source and renders it.
  it('fails when a real claim is removed from PLANS', async () => {
    expect((await problemsAfterEdit(`'Open and share 2 private models a month',`, '')).join('\n'))
      .toMatch(/Free account card doesn't state "2 private models a month"/)
    expect((await problemsAfterEdit(`'2 GLB exports a week',`, '')).join('\n'))
      .toMatch(/Free account card doesn't state "2 GLB exports a week"/)
    expect((await problemsAfterEdit(`'Unlimited GLB exports',`, '')).join('\n'))
      .toMatch(/Share Pro card doesn't state/)
  }, RENDER_TIMEOUT_MS)

  // A claim kept only in a dead string must not satisfy the check: it never
  // renders (codex review on Share#1971).
  it('is not satisfied by a claim that never renders', async () => {
    const problems = await problemsAfterEdit(
      `'Open and share 2 private models a month',`,
      `// '2 private models a month',\n`)
    expect(problems.join('\n')).toMatch(/doesn't state "2 private models a month"/)
  }, RENDER_TIMEOUT_MS)

  it('fails a wrong number or window', async () => {
    expect((await problemsAfterEdit('2 private models a month', '3 private models a month')).join('\n'))
      .toMatch(/"3 private models a month" but the enforced allowance is 2 per 30 days/)
    expect((await problemsAfterEdit('2 GLB exports a week', '2 GLB exports a month')).join('\n'))
      .toMatch(/"2 GLB exports a month" but the enforced allowance is 2 per 7 days/)
  }, RENDER_TIMEOUT_MS)

  // Label and value in sibling JSX elements, on separate source lines: the
  // case a line-by-line source scan missed (codex review on Share#1971).
  it('fails a local-file limit split across JSX elements', async () => {
    const problems = await problemsAfterEdit(
      `<Box sx={{mt: 'auto', pt: 2}}>`,
      `<Typography variant="body2">Local files</Typography>
                  <Typography variant="body2">Maximum: 5 per month</Typography>
                  <Box sx={{mt: 'auto', pt: 2}}>`)
    expect(problems.join('\n')).toMatch(/limit claim about local files.*"Local files" \/ "Maximum: 5 per month"/)
  }, RENDER_TIMEOUT_MS)

  it('fails local-file limits, load-count copy and unverified counts in rendered text', () => {
    for (const segments of [
      ['Open 5 local files a month'],
      ['Drag and drop', 'up to 3 models'],
      ['Local files: limited'],
      ['Uploads', '10 per month'],
      ['Files from your computer', '2 a week'],
      ['2 model loads per month'],
      ['25 private model loads'],
      ['4 private models'],
    ]) {
      expect(copyProblems(segments)).not.toEqual([])
    }
    // Saying local files are free is fine; a limit on them isn't. A price
    // two elements away from local wording isn't a limit on local files.
    expect(copyProblems(['Your files never leave your computer', 'Open and share public GitHub models, unlimited']))
      .toEqual([])
    expect(copyProblems(['$', '0', '/month', 'No login required:', 'Your files never leave your computer']))
      .toEqual([])
  })
})
