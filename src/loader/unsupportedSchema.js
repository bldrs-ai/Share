import {stepSchemaName} from '../Filetype'


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
 * text, and kept out of Sentry's error stream, because an unsupported schema
 * is an expected outcome and not a code defect.
 */
export class UnsupportedSchemaError extends Error {
  /**
   * @param {string} schema the file's FILE_SCHEMA value, e.g. 'IFC4X3_RC2'
   */
  constructor(schema) {
    super(`This model is ${schema} (IFC 4.3). Share can open some IFC 4.3 ` +
      'models, but not this one yet.')
    this.name = 'UnsupportedSchemaError'
    this.schema = schema
  }
}


/**
 * How many leading bytes to sniff for the header. Matches the prefix
 * `Filetype`'s sniffing already works from; FILE_SCHEMA sits in the HEADER
 * section, which on any real model ends well inside this.
 */
const BYTES_PER_KIB = 1024
const HEADER_SNIFF_KIB = 64
const HEADER_SNIFF_BYTES = HEADER_SNIFF_KIB * BYTES_PER_KIB


/**
 * An open about to be made: the id conway will attempt it under, and the
 * statistics object already under that id, if any.
 *
 * @typedef {object} OpenAttempt
 * @property {number} id the id conway will attempt the open under
 * @property {object} [before] the statistics object already under that id
 */


/**
 * Mark an open about to be made, so {@link conwayRefusedSchema} can tell
 * afterwards whether THAT open was refused. Call immediately before the
 * open, with nothing awaited in between.
 *
 * conway keys a load's statistics — including the `UNSUPPORTED_SCHEMA` load
 * status its IFC4X3 refusal records — by the id the open was attempted
 * under, and a refused open returns -1 rather than that id. Every conway
 * open takes its id from the public `globalModelIDCounter` synchronously at
 * call time (the async opens increment it before their first await; the
 * sync `OpenModel` increments only on success), so the counter's value
 * immediately before the call IS the attempted id.
 *
 * That id is only unique within one `IfcAPI`, while conway's statistics
 * live in a module-level map that outlives it — Share builds a fresh
 * `IfcAPI` per load (ShareIfc.js), so ids restart at 0 while an earlier
 * load's statistics stay. An open that fails before its header parses
 * (a corrupt header) writes no statistics at all, and would read an
 * earlier refusal's. So the attempt also snapshots the statistics object
 * already under that id: conway creates a NEW one for every open that gets
 * far enough to refuse, and only a new one counts. Two loads running at
 * once in separate `IfcAPI`s would share id 0 in that map and could read
 * each other's status; Share runs one load at a time, so this is noted
 * rather than guarded.
 *
 * @param {object} ifcAPI
 * @return {OpenAttempt|undefined} undefined on an engine without the
 *   counter (real web-ifc), which never refuses on schema anyway
 */
export function beginOpenAttempt(ifcAPI) {
  const id = ifcAPI?.globalModelIDCounter
  if (typeof id !== 'number') {
    return undefined
  }
  return {id, before: statisticsFor(ifcAPI, id)}
}


/**
 * Did conway refuse the open marked by `attempt` because of its schema?
 *
 * This is the POSITIVE signal: conway sets `UNSUPPORTED_SCHEMA` only on its
 * IFC4X3 refusal paths (bldrs-ai/conway#713, #718), never on a geometry
 * failure or on a non-4X3 file, so an engine regression on an IFC4X3 file
 * conway does support keeps the generic error — the header alone cannot
 * tell those apart. One overlap is conway's by design: its eligibility
 * decision needs a COMPLETE parse, so a truncated or syntax-broken 4X3 file
 * is refused the same way (conway#718's `decide`) and gets this dialog
 * rather than the generic error; the message's "not this one yet" is
 * worded to stay true for it. And it must be THIS open's statistics (a
 * different object from the one {@link beginOpenAttempt} saw), not a
 * leftover.
 *
 * @param {object} ifcAPI
 * @param {OpenAttempt|undefined} attempt from {@link beginOpenAttempt}
 * @return {boolean}
 */
export function conwayRefusedSchema(ifcAPI, attempt) {
  if (attempt === undefined) {
    return false
  }
  const after = statisticsFor(ifcAPI, attempt.id)
  if (after === undefined || after === attempt.before) {
    return false
  }
  try {
    return after.getLoadStatus?.() === 'UNSUPPORTED_SCHEMA'
  } catch (_) {
    return false
  }
}


/**
 * @param {object} ifcAPI
 * @param {number} id
 * @return {object|undefined} conway's statistics for `id`, if any
 */
function statisticsFor(ifcAPI, id) {
  if (typeof ifcAPI?.getStatistics !== 'function') {
    return undefined
  }
  try {
    return ifcAPI.getStatistics(id) ?? undefined
  } catch (_) {
    return undefined
  }
}


/**
 * The error to throw when conway's open returned a non-model id.
 *
 * Only a load conway itself reported as a schema refusal
 * ({@link conwayRefusedSchema}) is singled out; everything else keeps the
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
 * @param {boolean} refused {@link conwayRefusedSchema} for this open
 * @return {Promise<Error>} an UnsupportedSchemaError, or the generic open error
 */
export async function openModelFailure(modelID, source, refused) {
  const generic = new Error(`parseIfcWithConway: OpenModel returned ${modelID}`)
  if (!refused) {
    return generic
  }
  let schema = null
  try {
    schema = stepSchemaName(await headerText(source))
  } catch (_) {
    // Unreadable header: still a refusal, just an unnamed one.
  }
  return new UnsupportedSchemaError(
    schema !== null && /^IFC4X3/i.test(schema) ? schema : 'IFC4X3')
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
