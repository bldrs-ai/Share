/**
 * What Share withholds from Sentry that the browser console still shows.
 *
 * Sentry's default breadcrumbs integration records console output and the
 * attributes of clicked elements, so text that names the user's file reached
 * every event captured after it:
 *
 * - The load report's model line, `Model: <header FILE_NAME> — <schema>,
 *   <size>, <originating system> (<preprocessor>)`, written by conway's
 *   formatModelLine and echoed by `loader/loadProgress.js#addReportLine`. The
 *   header text is whatever the exporter wrote, and has included a full UNC
 *   path to a company file share (SHARE-1MT, 2026-11-03).
 * - Console lines that name a file the user handed Share, such as the drop
 *   path's rejected-upload warning (`app/dragAndDrop.js`, test-models#69)
 *   and the no-model-in-archive warning (`loader/modelArchive.js`). They name
 *   it through {@link consoleFileName}, and every console line of that shape
 *   has the quoted name withheld here, so a new producer that follows the
 *   convention is covered without a pattern of its own.
 * - Click breadcrumbs, whose element path carries `title`, `aria-label`,
 *   `alt` and `name` values. Share puts file names in some of them (the
 *   recent-files list's `title`, the projects drawer's remove button).
 *
 * - OPFS worker error replies, logged by `OPFS/utils.js` as `Error from worker`
 *   lines, and the loader's "OPFS path failed" fallback warning. The worker's
 *   text interpolates the cache key, the original file path or the file name
 *   (Share#2107). Sentry keeps the line's structured `condition`/`status`
 *   (see {@link workerErrorLabel}) and loses the text.
 *
 * The console and the page keep all of it, since there the user is reading
 * their own file's details; only what Sentry records is rewritten. The load
 * report's Sentry context has its own copy for the same reason
 * (LoadReporter#sentryModelLine), and the load reporter's console tee
 * runs teed text through {@link redactConsoleMessage}.
 */


/**
 * How a model line starts wherever Sentry sees it, in place of
 * `Model: <header FILE_NAME>`.
 */
export const SENTRY_MODEL_LINE_PREFIX = 'Model: (name withheld)'

const WITHHELD_NAME = 'file (name withheld)'
const WITHHELD_VALUE = '(withheld)'
// Past this, a click breadcrumb's element path is withheld whole rather than
// scanned: the attribute pattern below is quadratic on a pathological run of
// unclosed `[title="`, and no real element path of Share's gets near it.
const MAX_ELEMENT_PATH_CHARS = 4096

const MODEL_LINE = /^Model: /
// `<prefix>: file "<name>"<rest>`, as consoleFileName writes it, where the
// prefix is a code identifier such as `handleFileDrop` or `modelArchive`. The
// `file ` marker keeps ordinary library warnings out (three.js writes
// `THREE.Sprite: "Raycaster.camera" needs to be set`). Greedy on the name, so
// a quote inside it can't end the match early: at worst a quote in <rest>
// withholds some of <rest> too, which over-redacts rather than leaks.
const QUOTED_FILE_NAME = /^([A-Za-z_$][\w$.#-]*): file "(.*)"(.*)$/s
// Sentry serializes a clicked element and its ancestors as CSS-like text,
// `p.MuiTypography-root[title="Tower.ifc"]`, without escaping quotes in the
// value; the lazy match up to `"]` takes a value with quotes in it whole,
// and `s` takes one with a newline in it.
// `Error from worker[ [condition=<c> status=<n>]]: <text>`, the shape
// workerErrorLabel writes. The bracket is built only from the worker's own
// condition constants and an HTTP status, so it is safe to keep.
const WORKER_ERROR_LINE = /^(Error from worker(?: \[condition=[\w-]+(?: status=\d+)?\])?):/
const OPFS_FALLBACK_LINE = /^Loader#load: OPFS path failed \(/
const OPFS_FALLBACK_REDACTED = 'Loader#load: OPFS path failed (details withheld); falling back to direct fetch.'
const NAMED_ATTRIBUTE = /\[(title|aria-label|alt|name)=".*?"\]/gs


/**
 * How a console line names a file the user handed Share, so that
 * {@link redactConsoleMessage} can withhold it from Sentry. Write the line as
 * `` `<prefix>: ${consoleFileName(name)} <rest>` ``.
 *
 * @param {string} name the user's file name
 * @return {string} `file "<name>"`
 */
export function consoleFileName(name) {
  return `file "${name}"`
}


/**
 * The label of a console line that logs an OPFS worker error reply, so that
 * {@link redactConsoleMessage} can keep the reply's structured fields and
 * withhold its text. Write the line as `console.error(workerErrorLabel(data), data.error)`.
 *
 * @param {object} data the worker's reply, with its optional `condition` and `status`
 * @return {string} the label: with the condition and status when the reply has
 *   them, else just `Error from worker:`
 */
export function workerErrorLabel(data) {
  // Only a plain condition identifier and a numeric status are echoed, so a
  // producer that put free text in `condition` can't smuggle it into the
  // label (and past the redaction's own pattern).
  const condition = typeof data?.condition === 'string' && /^[\w-]+$/.test(data.condition) ? data.condition : ''
  if (!condition) {
    return 'Error from worker:'
  }
  const status = Number.isInteger(data.status) ? ` status=${data.status}` : ''
  return `Error from worker [condition=${condition}${status}]:`
}


/**
 * The text Sentry gets for errors whose own message names the user's file,
 * by error object (see {@link withSentrySafeMessage}).
 */
const sentrySafeMessages = new WeakMap()


/**
 * Give `error` the message Sentry should record in place of its own, and
 * return it. The page, the console and the user's alert keep `error.message`.
 *
 * For errors built from text that can name the user's file, and that can
 * reach a `captureException`: an OPFS worker's error reply rethrown for an
 * upload (Loader.js#load), which CadView reports when the load fails
 * (Share#2107). `redactEventExceptions` applies it in `beforeSend`.
 *
 * @param {Error} error
 * @param {string} message what Sentry records instead
 * @return {Error} the same error
 */
export function withSentrySafeMessage(error, message) {
  if (error && typeof error === 'object') {
    sentrySafeMessages.set(error, message)
  }
  return error
}


/**
 * Sentry `beforeSend` step: replace the exception values of an error given a
 * safe message by {@link withSentrySafeMessage}, for the error itself and
 * every `cause` it chains to. Every other event passes unchanged.
 *
 * @param {object} event Sentry event
 * @param {object} [hint] Sentry hint, whose `originalException` is the error
 * @return {object} the event
 */
export function redactEventExceptions(event, hint) {
  const values = event?.exception?.values
  if (!Array.isArray(values)) {
    return event
  }
  const roots = [hint?.originalException]
  for (const value of values) {
    if (typeof value?.value === 'string') {
      value.value = withSafeMessages(value.value, roots)
    }
  }
  return event
}


/**
 * `text` with the message of every error in `roots`, and in their `cause`
 * chains, that carries a safe message replaced by that safe message.
 *
 * @param {string} text
 * @param {Array<*>} roots values that may be such errors
 * @return {string}
 */
function withSafeMessages(text, roots) {
  let out = text
  for (const {message, safe} of markedErrors(roots)) {
    if (out.includes(message)) {
      out = out.split(message).join(safe)
    } else if (out.endsWith(TRUNCATION_MARK) && out.length > TRUNCATION_MARK.length &&
      message.startsWith(out.slice(0, -TRUNCATION_MARK.length))) {
      // Sentry cuts an exception value to `maxValueLength` (250) and appends
      // '...' before beforeSend runs (@sentry/core prepareEvent), so a long
      // message is no longer in the value whole. The value is then a prefix
      // of it, the part that names the file included: replace all of it.
      out = safe
    }
  }
  return out
}


/** What Sentry appends to a value it truncated. */
const TRUNCATION_MARK = '...'


/**
 * The errors among `roots` and their `cause` chains that carry a safe
 * message, each once.
 *
 * @param {Array<*>} roots
 * @return {Array<{message: string, safe: string}>}
 */
function markedErrors(roots) {
  const found = []
  const seen = new Set()
  for (const root of roots) {
    for (let error = root; error && typeof error === 'object' && !seen.has(error); error = error.cause) {
      seen.add(error)
      const safe = sentrySafeMessages.get(error)
      if (safe !== undefined && typeof error.message === 'string' && error.message !== '') {
        found.push({message: error.message, safe})
      }
    }
  }
  return found
}


/**
 * The safe message `error` or an error in its `cause` chain carries, for a
 * sink other than Sentry that reports the error's text (GA's `alert` event,
 * the load report's console tally), or undefined when there is none.
 *
 * @param {*} error
 * @return {string|undefined}
 */
export function sentrySafeMessageOf(error) {
  return markedErrors([error])[0]?.safe
}


/**
 * Sentry `beforeBreadcrumb`: rewrite a console or click breadcrumb that names
 * the user's file, and pass every other breadcrumb through unchanged.
 *
 * The console integration keeps the call's raw arguments in
 * `data.arguments` beside the joined `message`, so a rewritten console
 * breadcrumb gets both replaced and keeps only the redacted message.
 *
 * @param {object} breadcrumb
 * @return {object} the breadcrumb to record
 */
export function redactBreadcrumb(breadcrumb) {
  if (typeof breadcrumb?.message !== 'string') {
    return breadcrumb
  }
  if (breadcrumb.category === 'console') {
    // A logged Error that carries a safe message (withSentrySafeMessage) is
    // replaced first: CadView logs the load's error with console.error(e)
    // before it captures it, and the console integration records it as
    // `Error: <its message>`, which names the file however the line starts.
    const args = breadcrumb.data?.arguments
    const message = Array.isArray(args) ? withSafeMessages(breadcrumb.message, args) : breadcrumb.message
    const redacted = redactConsoleMessage(message)
    if (redacted === breadcrumb.message) {
      return breadcrumb
    }
    return {...breadcrumb, message: redacted, data: {...breadcrumb.data, arguments: [redacted]}}
  }
  if (typeof breadcrumb.category === 'string' && breadcrumb.category.startsWith('ui.')) {
    const redacted = breadcrumb.message.length > MAX_ELEMENT_PATH_CHARS ?
      WITHHELD_VALUE :
      breadcrumb.message.replace(NAMED_ATTRIBUTE, `[$1="${WITHHELD_VALUE}"]`)
    return redacted === breadcrumb.message ? breadcrumb : {...breadcrumb, message: redacted}
  }
  return breadcrumb
}


/**
 * One console line as Sentry may see it: a model line reduced to its prefix,
 * a quoted file name withheld, anything else unchanged.
 *
 * @param {string} message a console line, or a breadcrumb's joined message
 * @return {string} the message with any file name withheld, or unchanged
 */
export function redactConsoleMessage(message) {
  if (MODEL_LINE.test(message)) {
    // Nothing on the line is safe to keep without re-deriving it, and the
    // report context already carries the safe fields; the prefix alone says
    // where in the load this breadcrumb fell.
    return SENTRY_MODEL_LINE_PREFIX
  }
  const worker = WORKER_ERROR_LINE.exec(message)
  if (worker) {
    return `${worker[1]}: (details withheld)`
  }
  if (OPFS_FALLBACK_LINE.test(message)) {
    return OPFS_FALLBACK_REDACTED
  }
  const quoted = QUOTED_FILE_NAME.exec(message)
  if (quoted) {
    return `${quoted[1]}: ${WITHHELD_NAME}${quoted[3]}`
  }
  return message
}


/** What {@link withholdModelNames} writes in place of a model's name or path. */
export const WITHHELD_MODEL_NAME = '(model name withheld)'

// A bare stem shorter than this ("a", "v2") is too likely to be an ordinary
// word in the text to withhold on sight; the full file name still is.
const MIN_STEM_CHARS = 4
// Loader.js's composed root label, `<scene name> (<file name>)`.
const COMPOSED_LABEL = /^(.*) \(([^()]+)\)$/s
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
// Branch names too common to withhold on sight: they are words in a reply.
const DEFAULT_BRANCHES = new Set(['main', 'master', 'develop', 'development', 'trunk'])


/**
 * The strings that name a private model, for {@link withholdModelNames}.
 * Longest first, so a whole URL is withheld before a part of it is.
 *
 * - **Every path the route carries** (`filepath`, `gitpath`, `downloadUrl`,
 *   `srcUrl`, and `originalUrl`, the Share link, which embeds the model's
 *   URL), each in every form free text tends to quote it in: as stored,
 *   percent-decoded, with its query and hash cut (a signed URL's `?sig=`),
 *   both, and each of those without its scheme (Codex on #2313: a reply that
 *   quotes `https://host/private/Secret Project.glb` must not leak the host
 *   and path around a withheld file name).
 * - **Its file name** (the last segment, decoded) and that name's stem.
 * - **For a URL model** (route kind `url`), the folder it sits in
 *   (`https://host/private/`, in the same forms) and its host: the host of a
 *   private URL is itself telling, and withholding it costs only some
 *   over-redaction. Not for the other kinds, whose hosts are GitHub's,
 *   Google's or Share's own.
 * - **For GitHub**, the owner, the repo and `owner/repo` (which every GitHub
 *   URL form carries: github.com, raw.githubusercontent.com, the API), and a
 *   branch other than a common default (`main` is a word too).
 * - **For Drive**, the file id and resource key, which every Drive URL form
 *   carries.
 * - **The further names given**: the tree root's label and, for an upload,
 *   its original file name (the route holds only a storage UUID;
 *   loader/uploadedFileName.js). A root label can be composed,
 *   `<scene name> (<file name>)` (Loader.js, #1595, for glTF, OBJ and the
 *   other mesh formats), so its parts are withheld on their own too: a reply
 *   that says just `Secret.glb` or `Secret` must not get past a label that
 *   says `Scene (Secret.glb)` (Codex on #2313).
 *
 * A name shorter than MIN_STEM_CHARS is withheld only as part of a longer one.
 *
 * @param {object|null} routeResult routes.ts#handleRoute, the store's `modelPath`
 * @param {Array<string>} [extraNames]
 * @return {Array<string>}
 */
export function modelNamesOf(routeResult, extraNames = []) {
  const names = new Set()
  const add = (value) => {
    const text = typeof value === 'string' ? value.trim() : ''
    if (text) {
      names.add(text)
    }
  }
  const addWord = (value) => {
    if (typeof value === 'string' && value.trim().length >= MIN_STEM_CHARS) {
      add(value)
    }
  }
  // A file name, and its stem when that is long enough to not be an
  // ordinary word.
  const addFileName = (name) => {
    add(name)
    addWord(name.trim().replace(/\.[^.]+$/, ''))
    // As it appears inside a URL of a form the route doesn't hold.
    try {
      add(encodeURIComponent(name.trim()))
    } catch {
      // A lone surrogate won't encode; the name itself is withheld above.
    }
  }
  // A path or URL in each form it is quoted in.
  const addPathForms = (value) => {
    for (const form of pathForms(value)) {
      add(form)
      add(form.replace(SCHEME, ''))
    }
  }
  const isUrlModel = routeResult?.kind === 'url'
  for (const key of ['filepath', 'gitpath', 'downloadUrl', 'srcUrl', 'originalUrl']) {
    const value = routeResult?.[key]
    if (value === undefined || value === null || String(value) === '') {
      continue
    }
    const path = String(value)
    addPathForms(path)
    const segment = stripQuery(path).split('/').filter(Boolean).pop() ?? ''
    addFileName(segment)
    addFileName(safeDecode(segment))
    if (isUrlModel && key !== 'originalUrl') {
      const url = parseUrl(stripQuery(path))
      if (url) {
        addPathForms(`${url.origin}${url.pathname.replace(/[^/]*$/, '')}`)
        addWord(url.host)
        addWord(url.hostname)
      }
    }
  }
  if (routeResult?.kind === 'provider' && routeResult.provider === 'github') {
    const {org, repo, branch} = routeResult
    if (org && repo) {
      add(`${org}/${repo}`)
    }
    addWord(org)
    addWord(repo)
    if (typeof branch === 'string' && !DEFAULT_BRANCHES.has(branch.toLowerCase())) {
      addWord(branch)
    }
  }
  if (routeResult?.kind === 'provider' && routeResult.provider === 'google') {
    addWord(routeResult.fileId)
    addWord(routeResult.resourceKey)
  }
  addWord(routeResult?.title)
  for (const name of extraNames) {
    if (typeof name !== 'string' || name.trim().length < MIN_STEM_CHARS) {
      continue
    }
    addFileName(name)
    const composed = COMPOSED_LABEL.exec(name.trim())
    if (composed) {
      addWord(composed[1])
      addFileName(composed[2])
    }
  }
  return [...names].sort((a, b) => b.length - a.length)
}


/**
 * @param {string} value a path or URL
 * @return {Set<string>} it as stored, decoded, without its query and hash, and both
 */
function pathForms(value) {
  const stripped = stripQuery(value)
  return new Set([value, safeDecode(value), stripped, safeDecode(stripped)])
}


/**
 * @param {string} value
 * @return {string} it without its `?query` and `#hash`
 */
function stripQuery(value) {
  return value.split(/[?#]/)[0]
}


/**
 * @param {string} value
 * @return {string} it percent-decoded, or as written when a stray % won't decode
 */
function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}


/**
 * @param {string} value
 * @return {URL|null}
 */
function parseUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}


/**
 * Free text with every occurrence of a private model's names and paths
 * withheld (case-insensitive), for a sink outside the page that keeps text:
 * the assistant's feedback store (Components/Bot/assistFeedback.js), whose
 * reply and prompt can name the model the user was looking at. Like the rest
 * of this file, the page keeps the real names.
 *
 * It catches the names Share knows, not every way free text can name a file
 * (a misspelling, a name the user typed that isn't the model's), which is why
 * the feedback note says what is shared.
 *
 * @param {string} text
 * @param {Array<string>} names from {@link modelNamesOf}
 * @return {string}
 */
export function withholdModelNames(text, names) {
  if (typeof text !== 'string' || text === '' || !Array.isArray(names)) {
    return typeof text === 'string' ? text : ''
  }
  const alternatives = names.filter((name) => typeof name === 'string' && name !== '')
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
  if (alternatives.length === 0) {
    return text
  }
  // One pass over one alternation, longest first: a path goes whole before
  // its file name could match inside it, and a name that occurs in the
  // placeholder itself ("model.ifc" → stem "model") can't match the text
  // already replaced.
  return text.replace(new RegExp(alternatives.join('|'), 'gi'), WITHHELD_MODEL_NAME)
}


/**
 * @param {string} text
 * @return {string} it, with every RegExp metacharacter escaped
 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
