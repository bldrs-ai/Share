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
 * The model id conway will assign to the NEXT open, read immediately before
 * making it.
 *
 * conway keys a load's statistics — including the `UNSUPPORTED_SCHEMA` load
 * status its IFC4X3 refusal records — by the id the open was attempted
 * under, and a refused open returns -1 rather than that id. Every conway
 * open takes its id from the public `globalModelIDCounter` synchronously at
 * call time (the async ones post-increment it before their first await; the
 * sync `OpenModel` increments only on success), so the counter's value
 * immediately before the call IS the attempted id — provided nothing else
 * opens in between, which holds when the read and the call are adjacent
 * statements. Undefined on an engine without the counter (real web-ifc),
 * which never refuses on schema anyway.
 *
 * @param {object} ifcAPI
 * @return {number|undefined}
 */
export function nextModelID(ifcAPI) {
  const next = ifcAPI?.globalModelIDCounter
  return typeof next === 'number' ? next : undefined
}


/**
 * Did conway refuse the open attempted under `attemptedID` because of its
 * schema? This is the POSITIVE signal: conway sets the load status only on
 * its IFC4X3 refusal paths (bldrs-ai/conway#713, #718), never on a parse
 * or geometry failure, so a corrupt or regressed load of an IFC4X3 file
 * conway does support reads anything but `UNSUPPORTED_SCHEMA` and keeps the
 * generic error — the header alone cannot tell those apart.
 *
 * @param {object} ifcAPI
 * @param {number|undefined} attemptedID from {@link nextModelID}
 * @return {boolean}
 */
export function conwayRefusedSchema(ifcAPI, attemptedID) {
  if (attemptedID === undefined || typeof ifcAPI?.getStatistics !== 'function') {
    return false
  }
  try {
    return ifcAPI.getStatistics(attemptedID)?.getLoadStatus?.() === 'UNSUPPORTED_SCHEMA'
  } catch (_) {
    return false
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
