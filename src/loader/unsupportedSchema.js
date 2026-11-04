import {captureMessage} from '@sentry/react'
import {stepSchemaName} from '../Filetype'
import {isLocalOnlyPath} from '../routes/localOnly'
import {EngineOpenFailureError} from './engineOpenFailure'
import {loadFailureCaptureContext} from './loadProgress'


// The engine-side half (marking an open, reading its refusal and failure
// reason off conway's statistics) lives in `openAttempt.js`, which is
// worker-safe: the engine worker classifies its own failed opens with it
// (engine-worker.md §2.4 G3). Re-exported so existing callers are unchanged.
export {beginOpenAttempt, conwayOpenFailure, conwayRefusedSchema} from './openAttempt'


/**
 * Thrown when conway refuses a model because of its IFC schema rather than
 * because of a defect in the file or the engine.
 *
 * conway fails closed on IFC4X3 content it cannot read correctly
 * (bldrs-ai/conway#713): its geometry extraction is typed against IFC4, and
 * 4x3 adds entity types IFC4 does not have and changes the attribute layout
 * of some it does. Since bldrs-ai/conway#718 a 4x3 file whose content IFC4
 * can decode (plus the road entities it translates) loads, so only the rest
 * — alignments, spirals, sectioned solids, … (bldrs-ai/conway#716) — still
 * reach here. It refuses instead of guessing, and the web-ifc compat
 * surface reports that as `OpenModel` returning -1 — the same value every
 * other open failure returns. Without this type the user saw
 * "parseIfcWithConway: OpenModel returned -1" and a "contact us on Discord"
 * footer for a documented, intended limitation.
 *
 * Handled like the OOM and NeedsReconnect alerts in CadView: its own dialog
 * text, and kept out of Sentry's ERROR stream, because an unsupported schema
 * is an expected outcome and not a code defect. It is still counted there,
 * as an `info` message ({@link reportUnsupportedSchema}), because how often
 * users hit it is what ranks the IFC 4.3 work (Share#1879).
 */
export class UnsupportedSchemaError extends Error {
  /**
   * @param {string} schema the file's FILE_SCHEMA value, e.g. 'IFC4X3_RC2'
   * @param {number} [sizeBytes] the refused file's size, when known
   */
  constructor(schema, sizeBytes) {
    super(`This model is ${schema} (IFC 4.3). Share can open some IFC 4.3 ` +
      'models, but not this one yet.')
    this.name = 'UnsupportedSchemaError'
    this.schema = schema
    this.sizeBytes = sizeBytes
  }
}


/**
 * Count one refusal in Sentry, to rank the IFC 4.3 work
 * (bldrs-ai/conway#716) by how often users actually hit it (Share#1879).
 *
 * A message at level `info`, never an exception: this is demand, not a
 * defect, and must not count toward crash-free rates or read as an engine
 * bug in triage. One issue per schema spelling (the fingerprint), so the
 * issue list reads as a ranking — `IFC4X3_RC2` vs `IFC4X3_ADD2` — with
 * Sentry's own event and user counts on each.
 *
 * The load context (`load.phase` tag, `load` context with the report) is
 * the same a failed load's exception gets, so an event can be traced back
 * to the file without user contact — but attached to this event only, never
 * to the session's scope.
 *
 * What it does not carry yet is WHICH 4.3 features caused the refusal
 * (alignments, spirals, sectioned solids, …) — the thing that maps a
 * refusal onto a #716 phase. conway computes those reasons but does not
 * hand them to Share; bldrs-ai/conway#720 tracks exposing them, and they
 * belong on this event as a tag when it lands.
 *
 * @param {UnsupportedSchemaError} err the refusal
 * @param {object|null} routeResult the route the model was opened from
 *   (src/routes/routes.ts#RouteResult)
 */
export function reportUnsupportedSchema(err, routeResult) {
  try {
    // The load context goes on THIS event only: applying it to the scope
    // (attachLoadFailureContext) would leave the refused model's load
    // details on every later event in the session.
    const load = loadFailureCaptureContext()
    const tags = {
      ...load.tags,
      schema: err.schema,
      model_source: modelSourceOf(routeResult),
    }
    if (Number.isFinite(err.sizeBytes)) {
      tags.model_size_mb = Math.round(err.sizeBytes / BYTES_PER_MB)
    }
    captureMessage(`Unsupported IFC schema: ${err.schema}`, {
      level: 'info',
      fingerprint: ['unsupported-schema', err.schema],
      tags,
      contexts: load.contexts,
    })
  } catch (_) {
    // Reporting is best-effort; the user already has the dialog.
  }
}


/**
 * Where the refused model came from, as a low-cardinality Sentry tag.
 *
 * @param {object|null} routeResult
 * @return {string} 'upload' | 'hosted' | 'github' | 'google' | 'url' | 'unknown'
 */
export function modelSourceOf(routeResult) {
  switch (routeResult?.kind) {
    case 'file':
      return routeResult.isUploadedFile || isUploadRoute(routeResult.originalUrl) ? 'upload' : 'hosted'
    case 'provider':
      return typeof routeResult.provider === 'string' ? routeResult.provider : 'provider'
    case 'url':
      return 'url'
    default:
      return 'unknown'
  }
}


/**
 * How many leading bytes to sniff for the header. Matches the prefix
 * `Filetype`'s sniffing already works from; FILE_SCHEMA sits in the HEADER
 * section, which on any real model ends well inside this.
 */
const BYTES_PER_KIB = 1024
const BYTES_PER_MB = BYTES_PER_KIB * BYTES_PER_KIB
const HEADER_SNIFF_KIB = 64
// Exported for engine/engineModelLoad.js#openFailureSource, which keeps
// exactly this much of a source whose bytes it transfers to a worker.
export const HEADER_SNIFF_BYTES = HEADER_SNIFF_KIB * BYTES_PER_KIB


/**
 * The error to throw when conway's open returned a non-model id.
 *
 * Only a load conway itself reported as a schema refusal
 * (`openAttempt.js#conwayRefusedSchema`) is singled out; everything else keeps the
 * original message verbatim, so genuine engine failures stay recognisable
 * in Sentry and in tests that assert on it — including a failed load of an
 * IFC4X3 file conway does support (codex review of Share#1875). The file's
 * own header only NAMES the schema in the message, which is what
 * `stepSchemaName` is for; it never decides. A refusal whose header cannot
 * be read still gets the specific message, naming the family.
 *
 * A truncated IFC4X3 file is also refused by conway as ineligible (a partial
 * parse cannot establish eligibility), which is why the message says "not
 * this one yet" rather than naming a missing feature.
 *
 * @param {number|undefined} modelID what OpenModel* returned
 * @param {ArrayBuffer|Uint8Array|Blob} source the bytes that were opened
 * @param {boolean} refused `openAttempt.js#conwayRefusedSchema` for this open
 * @param {{status: string, reason: string}} [failure]
 *   `openAttempt.js#conwayOpenFailure` for this open, when conway recorded a reason
 * @return {Promise<Error>} an UnsupportedSchemaError; else, when conway gave
 *   a reason, an EngineOpenFailureError carrying it; else the generic open
 *   error (older conway, or no statistics for this open)
 */
export async function openModelFailure(modelID, source, refused, failure) {
  if (!refused) {
    return failure === undefined ?
      new Error(`parseIfcWithConway: OpenModel returned ${modelID}`) :
      new EngineOpenFailureError(modelID, failure.status, failure.reason)
  }
  let schema = null
  try {
    schema = stepSchemaName(await headerText(source))
  } catch (_) {
    // Unreadable header: still a refusal, just an unnamed one.
  }
  return new UnsupportedSchemaError(
    schema !== null && /^IFC4X3/i.test(schema) ? schema : 'IFC4X3',
    sourceSize(source))
}


/**
 * @param {ArrayBuffer|Uint8Array|Blob} source
 * @return {Promise<string>} the first HEADER_SNIFF_BYTES decoded as latin1
 */
async function headerText(source) {
  // Duck-typed rather than `instanceof`: a buffer can come from another realm
  // (a worker, or jsdom vs. Node in tests) where `instanceof Uint8Array` is
  // false for a real Uint8Array. Same reasoning as `isBlobSource` in
  // conwayDirectIfcLoader.js, which checks `ArrayBuffer.isView` for this.
  let bytes
  if (ArrayBuffer.isView(source)) {
    bytes = new Uint8Array(source.buffer, source.byteOffset,
      Math.min(source.byteLength, HEADER_SNIFF_BYTES))
  } else if (Object.prototype.toString.call(source) === '[object ArrayBuffer]') {
    bytes = new Uint8Array(source, 0, Math.min(source.byteLength, HEADER_SNIFF_BYTES))
  } else if (typeof source?.slice === 'function' && typeof source?.size === 'number') {
    bytes = new Uint8Array(await source.slice(0, HEADER_SNIFF_BYTES).arrayBuffer())
  } else {
    throw new Error('unsupportedSchema: unreadable source')
  }
  // latin1 so a stray non-UTF-8 byte in FILE_DESCRIPTION cannot throw; the
  // schema name itself is ASCII.
  return new TextDecoder('latin1').decode(bytes)
}


/**
 * Is this an upload route (`/share/v/local-only/…`, or the legacy
 * `/share/v/new/…`), whatever the install prefix? `routes/localOnly.ts` is
 * the one test; it already covers GitHub Pages-style installs served under a
 * prefix (`/Share/share/v/…`, codex review of Share#1899), and since #1959
 * routes.ts#processFile's `isUploadedFile` uses it too. This stays as the
 * fallback for a route result that doesn't carry the flag.
 *
 * @param {URL|string|undefined} originalUrl
 * @return {boolean}
 */
function isUploadRoute(originalUrl) {
  return isLocalOnlyPath(originalUrl)
}


/**
 * @param {ArrayBuffer|Uint8Array|Blob} source
 * @return {number|undefined} its size in bytes, when it has one
 */
function sourceSize(source) {
  if (typeof source?.byteLength === 'number') {
    return source.byteLength
  }
  if (typeof source?.size === 'number') {
    return source.size
  }
  return undefined
}
