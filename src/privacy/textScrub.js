import {supportedTypes} from '../Filetype'


/**
 * The structural backstop for free text Share sends to a store of its own
 * (feedback/submitFeedback.js, design/tracks/community-t100/feedback.md §"Privacy").
 *
 * The precise layer is sentryRedaction.js#withholdModelNames: it withholds
 * the names and paths Share knows for the model on screen, in the forms they
 * are quoted in. Three review rounds on #2313 each found another form it
 * didn't list (a decoded URL, a query-free one, a standalone pathname), so
 * for any model that isn't Share-hosted this runs after it and withholds
 * what LOOKS like a location, whatever it names:
 *
 * - **URLs**: anything `scheme://…` (http, https, s3, file, ftp, …) and
 *   `www.`-style hosts. Not `ref:`, the assistant's element-link scheme
 *   (viewer/tools/refLinks.js), which has no `//` and carries a ref.
 * - **Windows paths**: `C:\…` and `\\server\share\…`.
 * - **Paths of two or more segments**: a token with two or more `/` (`/a/b`,
 *   `/private/`, `a/b/c.ext`), or one starting `~/`, `./` or `../`. Not a
 *   token of digits and slashes only (a date, `11/24/2026`), and not a
 *   `ref:` link's target, whose scene-graph name paths (`ref:nScene/Wall`)
 *   are element refs, not file paths.
 * - **File names**: a token ending in a model or archive extension (Share's
 *   supported types, plus `gz`), with up to three capitalised words before it,
 *   so a name with spaces (`Secret Project.glb`) goes whole; and any quoted or
 *   backticked span ending in one. A bare extension (`an .ifc file`) is prose
 *   and stays.
 *
 * Ordinary prose passes unchanged: words, numbers, element refs (`e123`,
 * `o1.2.3`), `ref:` links, a single `and/or`. It over-redacts rather than
 * leaks: a sentence-initial word before a file name can go with it.
 */


export const WITHHELD_LINK = '(link withheld)'
export const WITHHELD_PATH = '(path withheld)'
export const WITHHELD_FILE = '(file name withheld)'

const EXTENSIONS = [...new Set([...supportedTypes, 'zip', 'gz'])].sort((a, b) => b.length - a.length).join('|')
// What a token can't hold: whitespace, brackets and quotes end it, so a
// Markdown link's `(…)` or a quoted name is taken apart at its edges.
const TOKEN_CHAR = '[^\\s()\\[\\]{}<>"\'`]'
const URL = new RegExp(`\\b[a-z][a-z0-9+.-]*:\\/\\/${TOKEN_CHAR}+|\\bwww\\.${TOKEN_CHAR}+`, 'gi')
const WINDOWS_PATH = /(?:\b[A-Za-z]:\\|\\\\)[^\s<>"'`|]*/g
const QUOTED_FILE = new RegExp(`(["'\`])([^"'\`\\n]{1,200}?\\.(?:${EXTENSIONS}))\\1`, 'gi')
const FILE_NAME = new RegExp(`(?:[A-Z0-9][\\w-]* ){0,3}${TOKEN_CHAR}+\\.(?:${EXTENSIONS})\\b`, 'g')
const FILE_NAME_ANY_CASE = new RegExp(`${TOKEN_CHAR}+\\.(?:${EXTENSIONS})\\b`, 'gi')
const TOKEN = new RegExp(`${TOKEN_CHAR}+`, 'g')
const TRAILING_PUNCTUATION = /[.,;:!?]+$/
const DATE_LIKE = /^[\d/]+$/
const REF_LINK = /^ref:/i


/**
 * @param {string} text
 * @return {string} it with URLs, paths and file names withheld
 */
export function scrubLocations(text) {
  if (typeof text !== 'string' || text === '') {
    return typeof text === 'string' ? text : ''
  }
  return text
    .replace(URL, (match) => keepTrailing(match, WITHHELD_LINK))
    .replace(WINDOWS_PATH, (match) => keepTrailing(match, WITHHELD_PATH))
    .replace(QUOTED_FILE, (_, quote) => `${quote}${WITHHELD_FILE}${quote}`)
    .replace(TOKEN, (token) => (isPathToken(token) ? keepTrailing(token, WITHHELD_PATH) : token))
    // Case-sensitive first, so capitalised words before a file name go with
    // it; then any case, for a lowercase name the first didn't reach.
    .replace(FILE_NAME, (match) => keepTrailing(match, WITHHELD_FILE))
    .replace(FILE_NAME_ANY_CASE, (match) => keepTrailing(match, WITHHELD_FILE))
}


/**
 * @param {string} token
 * @return {boolean} whether it is a path of two or more segments, not a ref link or a date
 */
function isPathToken(token) {
  if (REF_LINK.test(token) || DATE_LIKE.test(token)) {
    return false
  }
  const core = token.replace(TRAILING_PUNCTUATION, '')
  return (core.match(/\//g) ?? []).length >= 2 || /^(?:~|\.\.?)\//.test(core)
}


/**
 * @param {string} match what is withheld
 * @param {string} placeholder
 * @return {string} the placeholder, with the sentence punctuation that ended the match kept
 */
function keepTrailing(match, placeholder) {
  const trailing = TRAILING_PUNCTUATION.exec(match)?.[0] ?? ''
  return `${placeholder}${trailing}`
}
