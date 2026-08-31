// Deep import through conway's `./src/*` export map, the same route
// `loadProgress.js` takes to `core/progress_log`. Deliberately the detector
// itself and not a re-implementation — see the note on `isConwayIfcFormat`.
import ModelFormatDetector, {ModelFormatType} from '@bldrs-ai/conway/src/format_detection/model_format_detector'
import ParsingBuffer from '@bldrs-ai/conway/src/parsing/parsing_buffer'
import debug from '../utils/debug'


/**
 * The window conway's store-backed open sniffs the format in — its own
 * `STORE_DETECT_PREFIX_BYTES` (`compat/web-ifc/ifc_api_model_passthrough_
 * factory.js`). Reading exactly this much means our answer comes from the
 * same bytes conway's will.
 */
export const STORE_DETECT_PREFIX_BYTES = 65_536

// Completeness sniff for a part-21 source already in OPFS. GitHub cache
// HIT keys off the remote blob sha plus file existence, not local
// completeness: a write killed after truncate(0) (OPFS.worker.js
// writeFileToHandle) leaves a prefix under the correct sha, Conway
// finalizes that prefix as a complete index, and every forward ref into
// the missing tail is "not in the index" (Arty STYLED_ITEM #36800 →
// MANIFOLD_SOLID_BREP #1031384). The footer is required by ISO-10303-21;
// its absence on a file that still has the magic is the truncated case.
const PART21_MAGIC = 'ISO-10303-21'
const PART21_END = 'END-ISO-10303-21'
const PART21_HEAD_SNIFF_BYTES = 64
const PART21_TAIL_SNIFF_BYTES = 256


/**
 * True when `bytes` look like a part-21 file (IFC or STEP) whose DATA
 * section was cut off before `END-ISO-10303-21`. Non-part-21 inputs
 * (GLB, empty, random) return false — this is not a format detector.
 *
 * @param {ArrayBuffer|Uint8Array|null|undefined} bytes
 * @return {boolean}
 */
export function looksLikeTruncatedPart21(bytes) {
  if (bytes === null || bytes === undefined) {
    return false
  }
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (u8.byteLength === 0) {
    return false
  }
  const headLen = Math.min(PART21_HEAD_SNIFF_BYTES, u8.byteLength)
  if (!latin1(u8, 0, headLen).includes(PART21_MAGIC)) {
    return false
  }
  const tailStart = Math.max(0, u8.byteLength - PART21_TAIL_SNIFF_BYTES)
  return !latin1(u8, tailStart, u8.byteLength).includes(PART21_END)
}


/**
 * Blob/File twin of {@link looksLikeTruncatedPart21}: sniffs only the
 * first and last few hundred bytes so a 50MB OPFS hit does not have to
 * be buffered to decide.
 *
 * A 0-byte File is always unusable as a model source (the truncate(0)
 * then crash case) and is reported truncated regardless of magic.
 *
 * @param {Blob|null|undefined} blob
 * @return {Promise<boolean>}
 */
export async function looksLikeTruncatedPart21Blob(blob) {
  if (blob === null || blob === undefined ||
      typeof blob.size !== 'number' || typeof blob.slice !== 'function') {
    return false
  }
  if (blob.size === 0) {
    return true
  }
  const headLen = Math.min(PART21_HEAD_SNIFF_BYTES, blob.size)
  const tailStart = Math.max(0, blob.size - PART21_TAIL_SNIFF_BYTES)
  const [headBuf, tailBuf] = await Promise.all([
    blob.slice(0, headLen).arrayBuffer(),
    blob.slice(tailStart, blob.size).arrayBuffer(),
  ])
  const head = new Uint8Array(headBuf)
  if (!latin1(head, 0, head.byteLength).includes(PART21_MAGIC)) {
    return false
  }
  const tail = new Uint8Array(tailBuf)
  return !latin1(tail, 0, tail.byteLength).includes(PART21_END)
}


/**
 * Decode a byte range as ISO-8859-1. Part-21 keywords are ASCII; we
 * must not UTF-8-decode a sniff that might cut a multi-byte sequence.
 *
 * @param {Uint8Array} u8
 * @param {number} start
 * @param {number} end exclusive
 * @return {string}
 */
function latin1(u8, start, end) {
  let out = ''
  for (let i = start; i < end; i++) {
    out += String.fromCharCode(u8[i])
  }
  return out
}


/**
 * True when conway's `IfcApiModelPassthroughFactory.fromStore` will accept
 * these bytes — i.e. when its detector reads them as IFC rather than
 * AP214/AP203/AP242 or as no format at all.
 *
 * **This calls conway's detector rather than mirroring it, and that is the
 * whole point.** `fromStore` reserves the model handle BEFORE it sniffs and
 * is IFC-only, so a "yes" it then refuses burns handle 0 and pushes the
 * buffered retry onto handle 1 — misaddressing every Share call site that
 * passes the scene-level id 0, the GLB writer's spatial-tree and
 * element-properties captures among them (bldrs-ai/Share#1776). Only a
 * false-yes is expensive; a false-no costs one load's memory win.
 *
 * Share did briefly carry a regex mirror of `ModelFormatDetector.detect`
 * (#1780). Differential testing against the real detector found eleven
 * false-yes divergences in it, and they were not a matter of polish — the
 * detector's answer depends on conway's part-21 parser reaching `ENDSEC;` /
 * `DATA;` under byte-exact keyword matching with its own string-escape DFA
 * (`\S\` swallows the next byte, apostrophes included). A text scan cannot
 * agree with that except by becoming it. Handing conway the same prefix it
 * will read makes agreement exact by construction, so please do not
 * reintroduce a local reimplementation of this; see
 * `src/loader/stepFormat.test.js`, whose cases are all divergences the
 * mirror got wrong.
 *
 * @param {Uint8Array} prefix the file's first {@link STORE_DETECT_PREFIX_BYTES}
 * @return {boolean} true only when conway detects IFC
 */
export function isConwayIfcFormat(prefix) {
  try {
    return ModelFormatDetector.detect(new ParsingBuffer(prefix)) === ModelFormatType.IFC
  } catch (e) {
    // The detector walks unvalidated bytes; anything it throws on is a file
    // we would not want on the store path anyway. Buffering is the safe
    // outcome, so this never propagates.
    debug().warn('stepFormat#isConwayIfcFormat: detect threw; buffering:', e)
    return false
  }
}
