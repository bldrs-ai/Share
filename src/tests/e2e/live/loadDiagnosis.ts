/**
 * Why a live load did not get where a spec needed it — decided from what
 * the harness observed, so a failure in an engine nobody can run locally
 * names its cause instead of timing out with nothing. Pure, for
 * `loadDiagnosis.test.js`; `liveSession.ts#openLiveModel` and
 * `#waitForArtifactWritten` gather the signals and feed them in.
 *
 * Written after the first CI run of #1942, where both cross-engine
 * failures read as bare timeouts:
 *
 * - Firefox: `cadview-dropzone` "element(s) not found" for 90s. The
 *   dropzone is rendered unconditionally by CadView, so "not found" means
 *   the app tree never mounted or was torn down — in a production build, by
 *   `index.jsx`'s Sentry ErrorBoundary, which swaps the whole app for
 *   `ApplicationError`. The timeout said none of that.
 * - WebKit: `[glb] … "writer: wrote" never arrived … Captured: (none)` after
 *   the model loaded. Every `[glb]` line the specs wait on is emitted on the
 *   page's main thread (`Loader.js`, `glbExport.js` via `glbLog.js`), and
 *   Playwright's WebKit forwards main-thread console calls with their
 *   arguments joined exactly as Chromium does, so an EMPTY buffer is not a
 *   capture gap: the loader never reached its GLB cache lookup, which it
 *   only does on the OPFS path. Either the app found no OPFS in that
 *   context (`checkOPFSAvailability()` → false) or the OPFS block threw and
 *   `Loader.js` fell back to a direct fetch — and that fallback logs only a
 *   `debug().warn`, not a `[glb]` line. Waiting 90 more seconds for a writer
 *   that cannot run tells nobody which.
 */


/** Playwright engines whose Linux build has been seen to lack `navigator.storage`. */
const OPFS_LESS_ENGINES = ['webkit', 'firefox']


/**
 * Whether a cache-dependent spec should SKIP because this engine's Playwright
 * build has no OPFS at all, and the skip's reason; null means run it.
 *
 * Found by #1942's second CI run: Playwright's Linux WebKit build has no
 * `navigator.storage`, so `getDirectory()` throws a TypeError and the app
 * correctly reports `isOpfsAvailable: false` and loads from the network.
 * That is the build, not the product — real Safari has OPFS (#1686). The
 * gate is deliberately narrow:
 *
 * - Chromium NEVER skips. It has OPFS, so a missing one there is a real
 *   regression and has to fail.
 * - An engine that does have `getDirectory` never skips either, so an OPFS
 *   that exists but cannot write still fails with the OPFS probe's output.
 *
 * Pure so `loadDiagnosis.test.js` can pin both; `liveSession.ts#skipUnlessOpfs`
 * reads the probe from the page and calls `test.skip` with this reason.
 *
 * @param signals.engine Playwright's `browserType().name()`
 * @param signals.hasGetDirectory `typeof navigator.storage?.getDirectory === 'function'` in the page
 * @return the skip reason, or null when the spec should run
 */
export function opfsSkipReason(signals: {engine: string, hasGetDirectory: boolean}): string | null {
  const {engine, hasGetDirectory} = signals
  // An allow-list of the two engines that lack it, not "anything but
  // chromium": an engine the harness could not name must fail, not skip.
  if (hasGetDirectory || !OPFS_LESS_ENGINES.includes(engine)) {
    return null
  }
  return `${engine}: no navigator.storage in this Playwright build; OPFS cache paths are covered on ` +
    'chromium and by the manual Safari check (§8 step 7)'
}


/** What the page says about OPFS, read when an artifact wait fails. */
export type OpfsState = {
  /**
   * The app's own verdict, `useStore.getState().isOpfsAvailable`: null while
   * unknown, undefined when the store is not exposed on `window`.
   */
  app: boolean | null | undefined
  /** `navigator.storage.getDirectory()` from the page: 'ok', or the rejection. */
  directory: string
  /**
   * A worker's `createSyncAccessHandle()` write — the only OPFS write Safari
   * has (#1686), so the one the cache depends on: 'ok', the error, or why it
   * was not tried.
   */
  syncWrite: string
}

/** What the page looks like when the model never became ready. */
export type RenderState = {
  url: string
  hasDropzone: boolean
  /** `data-model-ready` on the dropzone, when there is one. */
  modelReady: string | null
  /** The start of `document.body.innerText`. */
  bodyText: string
  /** A fresh canvas's WebGL2 context: its renderer, or why there is none. */
  webgl2: string
}

export type ArtifactSignals = {
  /** `[glb]` lines captured since the last reset (glbLogs.ts#glbLinesSinceReset). */
  glbLines: string[]
  /** Page errors and console errors/warnings, from `liveSession.ts#captureLoadDiagnostics`. */
  diagnostics: string[]
  /** `isOpfsAvailable` as the store had it when the wait began; see `OpfsState.app`. */
  appOpfs: boolean | null | undefined
  elapsedMs: number
  timeoutMs: number
}

export type ArtifactVerdict = {state: 'done'} | {state: 'pending'} | {state: 'failed', reason: string}


/**
 * How long after the wait begins the reader's `[glb] reader:` line is still
 * given to arrive. The reader logs before the parse, so by the time the
 * model is ready it has normally long been captured; this is margin for
 * console events still in flight from the page, not a wait for the load.
 */
export const READER_GRACE_MS = 10_000

/** `Loader.js`'s warning when its OPFS block threw and it fell back to a direct fetch. */
export const OPFS_FALLBACK_NEEDLE = 'OPFS path failed'

const MAX_DIAGNOSTIC_LINES = 40
const MAX_LINE_CHARS = 400
const MAX_BODY_CHARS = 300


/**
 * Whether the GLB writer has produced the artifact, can no longer produce
 * it, or may still.
 *
 * Failing early matters as much as the message: each of these states used
 * to burn the full writer timeout, three specs per engine.
 *
 * @param signals what the harness has observed so far
 * @return the verdict, with the reason when failed
 */
export function artifactVerdict(signals: ArtifactSignals): ArtifactVerdict {
  const {glbLines, diagnostics, appOpfs, elapsedMs, timeoutMs} = signals
  if (glbLines.some((l) => l.includes('writer: wrote'))) {
    return {state: 'done'}
  }
  // The writer is fail-soft (glbExport.js): a skip is final for this load,
  // and the line itself says why — most usefully `skipped (threw)` + error.
  const skipped = glbLines.find((l) => l.includes('writer: skipped'))
  if (skipped !== undefined) {
    return {state: 'failed', reason: `the GLB writer gave up on this load: ${skipped}`}
  }
  if (appOpfs === false) {
    return {
      state: 'failed',
      reason: 'the app found no OPFS in this browser context (store isOpfsAvailable === false), so it ' +
        'loaded the model from the network and the GLB writer never runs',
    }
  }
  const fellBack = diagnostics.find((l) => l.includes(OPFS_FALLBACK_NEEDLE))
  if (fellBack !== undefined) {
    return {
      state: 'failed',
      reason: `the loader's OPFS path threw and it fell back to a direct fetch, which never runs the GLB writer: ${fellBack}`,
    }
  }
  // Loader.js treats a failed hash or lookup as a MISS but drops the cache
  // key with it, so no writer context is built for this load.
  const lookupFailed = glbLines.find((l) => l.includes('cache lookup failed'))
  if (lookupFailed !== undefined) {
    return {state: 'failed', reason: `the GLB cache lookup threw, so this load builds no writer context: ${lookupFailed}`}
  }
  const sawReader = glbLines.some((l) => l.includes('reader:'))
  if (!sawReader && elapsedMs >= READER_GRACE_MS) {
    return {
      state: 'failed',
      reason: 'the model is ready but the GLB reader never ran (no "[glb] reader:" line), so this load did not ' +
        'take the OPFS path and the GLB writer will not run',
    }
  }
  if (elapsedMs >= timeoutMs) {
    return {state: 'failed', reason: `no "writer: wrote" within ${timeoutMs}ms`}
  }
  return {state: 'pending'}
}


/**
 * The full message for an artifact wait that failed: the reason, then
 * everything that bears on it.
 *
 * @param reason from {@link artifactVerdict}
 * @param evidence what the page showed
 * @param evidence.glbLines `[glb]` lines since the last reset
 * @param evidence.opfs the OPFS probe, or null when the page could not be read
 * @param evidence.diagnostics page errors and console errors/warnings
 * @return the message
 */
export function describeArtifactFailure(reason: string, {glbLines, opfs, diagnostics}: {
  glbLines: string[], opfs: OpfsState | null, diagnostics: string[],
}): string {
  const opfsText = opfs === null ?
    '  (the page could not be read)' :
    [
      `  app isOpfsAvailable: ${opfs.app === undefined ? '(store not exposed)' : String(opfs.app)}`,
      `  navigator.storage.getDirectory(): ${opfs.directory}`,
      `  worker createSyncAccessHandle() write: ${opfs.syncWrite}`,
    ].join('\n')
  return [
    `No GLB artifact: ${reason}.`,
    'OPFS in this context:',
    opfsText,
    '[glb] lines captured:',
    indentOrNone(glbLines),
    'Page errors and console errors/warnings:',
    indentOrNone(diagnostics),
  ].join('\n')
}


/**
 * The full message for a model that never became ready.
 *
 * @param render what the page looked like at the timeout
 * @param diagnostics page errors and console errors/warnings
 * @return the message
 */
export function describeModelNotReady(render: RenderState | null, diagnostics: string[]): string {
  const lines = []
  if (render === null) {
    lines.push('The page could not be read.')
  } else {
    if (!render.hasDropzone) {
      // ApplicationError.jsx's own copy: the production ErrorBoundary's fallback.
      const crashed = render.bodyText.includes('not quite sure what went wrong')
      lines.push(crashed ?
        'The app crashed: its error boundary replaced the viewer with ApplicationError, so cadview-dropzone is gone.' :
        'cadview-dropzone is not in the DOM: the viewer never mounted, or was torn down.')
    } else {
      lines.push(`cadview-dropzone is there with data-model-ready=${render.modelReady}: the load itself did not finish.`)
    }
    lines.push(`  url: ${render.url}`)
    lines.push(`  WebGL2: ${render.webgl2}`)
    lines.push(`  body text: ${JSON.stringify(render.bodyText.slice(0, MAX_BODY_CHARS))}`)
  }
  lines.push('Page errors and console errors/warnings:')
  lines.push(indentOrNone(diagnostics))
  return lines.join('\n')
}


/**
 * One diagnostic line as it will be kept: credentials removed, length
 * capped. These lines end up in CI annotations of a public repository.
 *
 * @param line a page error or console message
 * @return the line, safe to print
 */
export function redactDiagnostic(line: string): string {
  const redacted = line
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '<jwt>')
    .replace(/(Bearer\s+)\S+/gi, '$1<token>')
    .replace(/((?:access|refresh|id)_token["']?\s*[:=]\s*["']?)[^"'&\s,}]+/gi, '$1<token>')
  return redacted.length > MAX_LINE_CHARS ? `${redacted.slice(0, MAX_LINE_CHARS)}…` : redacted
}


/**
 * Console lines that are the engine talking about itself, not the page —
 * Chromium's software-GL chatter repeats per frame and would fill the
 * buffer before the error that matters.
 *
 * @param line a console message
 * @return whether to drop it
 */
export function isEngineNoise(line: string): boolean {
  return /GL Driver Message|GroupMarkerNotSet|Automatic fallback to software WebGL/.test(line)
}


/**
 * Append a diagnostic, redacted, keeping only the first
 * {@link MAX_DIAGNOSTIC_LINES}: the first errors are the cause, the rest
 * usually its echoes.
 *
 * @param buffer the diagnostics buffer
 * @param line the raw line
 */
export function pushDiagnostic(buffer: string[], line: string) {
  if (buffer.length < MAX_DIAGNOSTIC_LINES && !isEngineNoise(line)) {
    buffer.push(redactDiagnostic(line))
  }
}


/**
 * @param lines lines to print
 * @return them indented, or a marker that there were none
 */
function indentOrNone(lines: string[]): string {
  return lines.length === 0 ? '  (none)' : lines.map((l) => `  ${l}`).join('\n')
}
