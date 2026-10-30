#!/usr/bin/env node
/**
 * Which deploy preview a PR's live smoke run may target, from the head
 * commit's statuses — for live-smoke.yml.
 *
 *   gh api --paginate repos/<repo>/commits/<sha>/statuses --jq '.[]' \
 *     | node tools/live-smoke/previewStatus.mjs netlify/<project>/deploy-preview
 *
 * Decided from the NEWEST status of that context only. A Netlify preview URL
 * is a stable alias for the PR, so when the same head is redeployed, an
 * older `success` still names the URL — which now serves the PREVIOUS deploy
 * until the new one lands. Picking "the first success" would smoke that and
 * report green for code that never deployed (Codex on #1942). So:
 *
 * - newest is `success` → print its URL, exit 0;
 * - newest is `pending`, or there is no status yet → exit 2 (keep polling);
 * - newest is `failure` / `error`, or a success without a URL → print why,
 *   exit 1.
 *
 * "Newest" is by `updated_at`, then `id`, rather than by position: GitHub
 * lists statuses newest first, but the decision should not rest on that.
 */


export const EXIT_READY = 0
export const EXIT_REFUSE = 1
export const EXIT_WAIT = 2


/**
 * @typedef {{id?: number, context: string, state: string, target_url?: ?string,
 *   description?: ?string, updated_at?: string, created_at?: string}} CommitStatus
 * @typedef {{verdict: string, url: ?string, state: ?string, reason: ?string}} PreviewVerdict
 */


/**
 * @param {Array<CommitStatus>} statuses the head commit's statuses, any order
 * @param {string} context e.g. `netlify/bldrs-share-prod/deploy-preview`
 * @return {PreviewVerdict} `verdict` is 'ready', 'wait' or 'failed'
 */
export function newestPreviewStatus(statuses, context) {
  const matching = statuses.filter((s) => s && s.context === context)
  if (matching.length === 0) {
    return {verdict: 'wait', url: null, state: null, reason: `no ${context} status yet`}
  }
  const when = (s) => Date.parse(s.updated_at || s.created_at || '') || 0
  const newest = matching.reduce((best, s) =>
    (when(s) > when(best) || (when(s) === when(best) && (s.id || 0) > (best.id || 0)) ? s : best))
  const why = `${context} is ${newest.state}${newest.description ? ` (${newest.description})` : ''}`
  if (newest.state === 'success') {
    if (typeof newest.target_url !== 'string' || newest.target_url === '') {
      return {verdict: 'failed', url: null, state: newest.state, reason: `${context} succeeded without a target URL`}
    }
    return {verdict: 'ready', url: newest.target_url, state: newest.state, reason: null}
  }
  if (newest.state === 'pending') {
    return {verdict: 'wait', url: null, state: newest.state, reason: why}
  }
  return {verdict: 'failed', url: null, state: newest.state, reason: why}
}


/**
 * Parse the statuses: one JSON array, or one JSON value per line — what
 * `gh api --paginate --jq '.[]'` prints (an object per line), or a page per
 * line.
 *
 * @param {string} text
 * @return {Array<CommitStatus>}
 */
function parseStatuses(text) {
  const trimmed = text.trim()
  if (trimmed.startsWith('[') && !/\]\s*\n\s*\[/.test(trimmed)) {
    return JSON.parse(trimmed)
  }
  const statuses = []
  for (const line of trimmed.split('\n')) {
    if (line.trim() === '') {
      continue
    }
    const value = JSON.parse(line)
    statuses.push(...(Array.isArray(value) ? value : [value]))
  }
  return statuses
}


/**
 * @param {Array<string>} argv `[context]`
 * @param {string} input the statuses JSON
 * @param {object} [io]
 * @param {{write: function(string): *}} [io.stdout]
 * @return {number} exit code
 */
export function main(argv, input, {stdout = process.stdout} = {}) {
  const context = argv[0]
  if (!context) {
    stdout.write('usage: previewStatus.mjs <status context> < statuses.json\n')
    return EXIT_REFUSE
  }
  let statuses
  try {
    statuses = parseStatuses(input)
  } catch {
    stdout.write('could not parse the commit statuses\n')
    return EXIT_REFUSE
  }
  const {verdict, url, reason} = newestPreviewStatus(statuses, context)
  if (verdict === 'ready') {
    stdout.write(`${url}\n`)
    return EXIT_READY
  }
  stdout.write(`${reason}\n`)
  return verdict === 'wait' ? EXIT_WAIT : EXIT_REFUSE
}


const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  process.exit(main(process.argv.slice(2), Buffer.concat(chunks).toString('utf8')))
}
