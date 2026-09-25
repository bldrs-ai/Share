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
    super(`This model is ${schema} (IFC 4.3), and it uses parts of that schema ` +
      'Share can\'t display yet.')
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
 * The error to throw when conway's open returned a non-model id.
 *
 * Only IFC4X3 is singled out, because that is the one schema conway refuses
 * BY DESIGN; for anything else the original message is kept verbatim so
 * genuine engine failures stay recognisable in Sentry and in tests that
 * assert on it. The schema is read from the file's own header, not inferred
 * from conway's logs: it is a naming question (which message to show), which
 * is what `stepSchemaName` is for — a wrong answer costs only a less specific
 * message, never a routing decision. See its doc comment in Filetype.js.
 *
 * Note a -1 on an IFC4X3 file is not proof of the schema refusal: conway can
 * also accept an eligible 4x3 file and then fail it for another reason. The
 * message is worded to stay true either way ("parts … Share can't display").
 *
 * @param {number|undefined} modelID what OpenModel* returned
 * @param {ArrayBuffer|Uint8Array|Blob} source the bytes that were opened
 * @return {Promise<Error>} an UnsupportedSchemaError, or the generic open error
 */
export async function openModelFailure(modelID, source) {
  const generic = new Error(`parseIfcWithConway: OpenModel returned ${modelID}`)
  let schema = null
  try {
    schema = stepSchemaName(await headerText(source))
  } catch (_) {
    // A header we cannot read is not a reason to replace the real error.
    return generic
  }
  return schema !== null && /^IFC4X3/i.test(schema) ?
    new UnsupportedSchemaError(schema) :
    generic
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
