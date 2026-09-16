// Opening the `.glb.gz` Share exports (#1831), by taking the envelope off.
//
// The #1854 write-up refused this round trip on the grounds that ".gz is a
// transport encoding, not a model format, and accepting one drags in a
// `supportedTypes` entry, a `findLoader` arm and header sniffing that upload,
// GitHub-raw and Drive would all have to agree on". The first half of that is
// exactly right and is why this module exists instead of that entry and that
// arm: gzip is never a format here. It is peeled off the bytes at two seams,
// and nothing downstream — routes, `findLoader`, `ShareModel` capabilities,
// the OPFS cache, the exporter — learns that a `.gz` was ever involved.
//
// The two seams, and why both:
//
//   - **Upload** ({@link inflateIfGzipEnvelope}), called by the drop handler
//     and the Open dialog's Local tab before the file reaches OPFS. What gets
//     cached and named `<uuid>.glb` is then really a GLB, so every later
//     reader of that entry — a re-open from Recents, a save, a size report —
//     is looking at what its name says. This is the path the feature is
//     scoped to.
//   - **Load** ({@link decodeGzipEnvelope}), called once in `Loader#load`
//     where the model's bytes are finally in hand. It is the net under every
//     other path: an upload whose envelope survived (the non-OPFS fallback
//     hands the loader the original blob), a locally hosted `/x.glb.gz`, a
//     pasted URL. Without it, `analyzeHeader` reporting 'glb' for gzipped
//     bytes would send those paths into the GLTF parser with a gzip member,
//     which fails deep and says nothing useful.
//
// `.spz` is the one format that IS a gzip stream, and it must reach its
// decoder compressed. Both seams exclude it — by sniffed type on the way in
// (`Filetype#analyzeHeader` answers 'spz' before it considers an envelope)
// and by `loader.type` on the way out.
//
// Design: design/new/glb-export-premium.md §4.7.
import {analyzeHeader, looksLikeGzipBytes} from '../Filetype'
import {GzipExpansionError, gunzipBytes, isGunzipAvailable} from '../export/glbGzip'
import debug from '../utils/debug'


// How far a user's gzip member is allowed to expand before we refuse it.
//
// gzip reaches ~1032:1, so a few MB of hostile input inflates to hundreds of
// GB: without a ceiling the drop handler is a one-click way to end the tab,
// and "it never finished" is the worst way to fail. 512 MiB is ~8× the
// largest GLB this feature has measured (63.7 MB for Autodesk's Snowdon
// demo, `export/glbGzip.js`) and at the far end of what a browser hands out
// as a single ArrayBuffer — past it the GLTF parse was not going to succeed
// anyway, so refusing early turns a hang into a sentence.
const BYTES_PER_KIB = 1024
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB
const MAX_INFLATED_MIB = 512
export const MAX_INFLATED_BYTES = MAX_INFLATED_MIB * BYTES_PER_MIB


// Enough of the file to sniff with; `analyzeHeader`'s own window.
const HEADER_LIMIT = 1024


/**
 * What a user is told when their `.glb.gz` cannot be opened.
 *
 * Carries a message meant for a snackbar, not a stack trace: the two ways
 * this fails are a browser without `DecompressionStream` (Safari before
 * 16.4, the same bound the v3 container has) and a file that is not what it
 * claims, and the user can act on each.
 */
export class GzipEnvelopeError extends Error {
  /** @param {string} msg */
  constructor(msg) {
    super(msg)
    this.name = 'GzipEnvelopeError'
  }
}


/**
 * Take a gzip transport envelope off an uploaded file, so what lands in OPFS
 * is the model.
 *
 * Decided on the HEADER, never the name: a `.glb.gz` that arrived as
 * `model.bin` still opens, and a `.glb` that is secretly gzipped opens too.
 * The name is not even rewritten — it stays what the user picked, for the
 * recents row and the load report, while the storage extension comes from
 * the sniff.
 *
 * Anything that is not a gzip member wrapping a recognized model comes back
 * untouched, including `.spz` (gzip is its container) and a gzipped
 * non-model, which then fails sniffing cleanly as an unknown type.
 *
 * @param {File} file the picked or dropped file
 * @return {Promise<File>} the same file, or one holding the inflated bytes
 * @throws {GzipEnvelopeError} when the envelope is there and cannot be opened
 */
export async function inflateIfGzipEnvelope(file) {
  let head
  try {
    head = await file.slice(0, Math.min(file.size, HEADER_LIMIT)).arrayBuffer()
  } catch (e) {
    // A handle that cannot be read at all — the file moved between the pick
    // and here, an environment whose Blob has no `arrayBuffer` — is not this
    // seam's problem to report. Pass it through and let the sniff and the
    // loader fail on it exactly as they did before there was an envelope to
    // look for; failing here instead would turn "could not read your file"
    // into a sentence about compression.
    debug().warn('gzipEnvelope#inflateIfGzipEnvelope: could not read header; passing through:', e)
    return file
  }
  if (!looksLikeGzipBytes(head)) {
    return file
  }
  const innerType = analyzeHeader(head)
  // 'spz' means the gzip IS the format; null means nothing recognizable came
  // out of the envelope, and inflating a .tar.gz nobody can load only moves
  // the same "unknown type" alert later and makes it cost 512 MiB first.
  if (innerType === null || innerType === 'spz') {
    return file
  }
  if (!isGunzipAvailable()) {
    throw new GzipEnvelopeError(
      `Cannot open a compressed (.gz) model in this browser. ` +
      `Unarchive it first, or use Safari 16.4+, Chrome 80+ or Firefox 113+.`)
  }
  debug().log('gzipEnvelope#inflateIfGzipEnvelope: inflating envelope around', innerType)
  const inflated = await inflateEnvelopeBytes(new Uint8Array(await file.arrayBuffer()))
  // Name kept, `lastModified` kept: this is the user's file with its
  // transport encoding removed, not a new one.
  return new File([inflated], file.name, {lastModified: file.lastModified})
}


/**
 * Take a gzip transport envelope off a model's bytes on the way into the
 * loader.
 *
 * The last seam before `readModel`, and the one that covers the paths the
 * upload seam cannot reach. Scoped tightly on purpose:
 *
 *   - `.spz` is skipped — gzip is that format's container, and its decoder
 *     wants the member.
 *   - Text formats are skipped, because by here they are a decoded string:
 *     gzip bytes run through `TextDecoder` are mojibake, not something to
 *     recognize. A gzipped text-format model therefore only opens through
 *     the upload seam, which sees the bytes.
 *   - A `File` (conway's store-backed open, part-21 only) is skipped: it is
 *     handed to the parser unread, and no part-21 file is a gzip member.
 *
 * @param {ArrayBuffer|Uint8Array|File|string} modelData
 * @param {string} loaderType the resolved format tag, i.e. `loader.type`
 * @return {Promise<ArrayBuffer|Uint8Array|File|string>} inflated where it
 *   applies, the same value otherwise
 * @throws {GzipEnvelopeError} when the envelope is there and cannot be opened
 */
export async function decodeGzipEnvelope(modelData, loaderType) {
  const isBinaryBuffer = modelData instanceof ArrayBuffer || ArrayBuffer.isView(modelData)
  if (loaderType === 'spz' || !isBinaryBuffer || !looksLikeGzipBytes(modelData)) {
    return modelData
  }
  if (!isGunzipAvailable()) {
    throw new GzipEnvelopeError(
      `Cannot open a compressed (.gz) model in this browser. ` +
      `Unarchive it first, or use Safari 16.4+, Chrome 80+ or Firefox 113+.`)
  }
  debug().log('gzipEnvelope#decodeGzipEnvelope: inflating envelope for', loaderType)
  const member = ArrayBuffer.isView(modelData) ? modelData : new Uint8Array(modelData)
  const inflated = await inflateEnvelopeBytes(member)
  // An ArrayBuffer, because that is what every binary loader's `parse` takes
  // and what the size line reads `byteLength` off.
  return inflated.buffer
}


/**
 * The inflate both seams share: capped, and with the two failures told apart.
 *
 * @param {Uint8Array} member
 * @return {Promise<Uint8Array>}
 * @throws {GzipEnvelopeError}
 */
async function inflateEnvelopeBytes(member) {
  try {
    return await gunzipBytes(member, {maxOutputBytes: MAX_INFLATED_BYTES})
  } catch (e) {
    if (e instanceof GzipExpansionError) {
      throw new GzipEnvelopeError(
        `This compressed file expands past ${MAX_INFLATED_BYTES} bytes, which is larger than any model Share can open.`)
    }
    throw new GzipEnvelopeError(`Could not decompress this file: ${e?.message || e}`)
  }
}
