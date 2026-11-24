// Opening the model inside a zip the user dropped or picked, and a `.ifczip`
// wherever it comes from (Share#2006).
//
// Half of the files the Open dialog rejected between 2026-09-17 and
// 2026-10-31 were archives (bldrs-ai/ops#26), many named as if a format Share
// opens was inside: `part.stp.zip`, `STEP.zip`, `… ifc.zip`, download
// bundles. This module decides what to do with one; `zipArchive.js` reads it.
//
// It sits at the same two upload seams as the gzip envelope
// (`gzipEnvelope.js`), right after it, and for the same reason: what reaches
// OPFS, recents and the load report is the MODEL — `<uuid>.ifc`, named
// `Tower.ifc` — and nothing downstream learns a zip was involved. Unlike gzip
// a zip is a container, not an encoding: it can hold no model, one, or
// several, so the seam can end in a refusal or a question as well as a file
// ({@link openUploadThroughArchive}).
//
// `.zip` and `.ifczip` are in `supportedTypes`, so they route, list in the
// GitHub browser and parse out of a permalink like any model; what they hold
// is decided by content, never the name. An upload is unwrapped here; a
// download reaches `Loader#load` still zipped (whatever its name), and
// {@link unwrapHostedArchive} is that path's net, one line before
// `readModel`, beside the gzip one.
//
// Design: design/new/adding-model-formats.md §"An archive is not a format either".
import {analyzeHeader, supportedTypes} from '../Filetype'
import debug, {WARN} from '../utils/debug'
import {DicomError, dicomSeriesToNrrd, groupSeries, looksLikeDicom, parseDicomSlice} from './dicom'
import {archiveGuidance} from './formatGuidance'
import {consoleFileName} from '../privacy/sentryRedaction'
import {extensionTag, unrecognizedFormatAlert} from './unrecognizedFormat'
import {
  MAX_TOTAL_INFLATED_BYTES,
  ZipArchiveError,
  asArchiveError,
  expandsPastMessage,
  extractZipEntry,
  looksLikeZipBytes,
  readZipDirectory,
} from './zipArchive'


/** The alert type of the entry chooser, rendered by AlertDialog. */
export const ARCHIVE_ENTRY_CHOICE = 'archiveEntryChoice'


/**
 * The alert type for a downloaded archive that can't be opened
 * ({@link unwrapHostedArchive}, raised by CadView): `{type, message}`, where the
 * message is a `ZipArchiveError`'s, which never names a file. An expected
 * outcome, counted in analytics only. Uploads don't use it: theirs are
 * `unrecognizedFormat` alerts, tagged by the upload's extension.
 */
export const ARCHIVE_UNREADABLE = 'archiveUnreadable'


// Enough of the file to sniff with; `analyzeHeader`'s own window.
const HEADER_LIMIT = 1024

// Formats that are zips themselves, read whole by their own loaders. A zip
// whose first entry gives one away is passed through by the sniff below; this
// covers the rest by name — a SOG bundle that doesn't lead with `meta.json`
// has only its `.sog` to say what it is (`Filetype.js#looksLikeSogArchive`).
export const ZIP_MODEL_TYPES = new Set(['usdz', 'sog'])

// The archive types in `supportedTypes`: a zip, and the IFC transport (a zip
// of one `.ifc`). Listed so routes, the GitHub browser and permalinks take
// them; what they hold is decided by content here, never by the name. Inside
// another archive one is opened one level down, and no further.
const ARCHIVE_TYPES = new Set(['zip', 'ifczip'])


// A `.gltf` names its buffers and textures by URI. Out of an archive it is
// one file at `/share/v/local-only/<uuid>.gltf`, so a relative `scene.bin`
// resolves to a URL the SPA answers with index.html (Sketchfab's download
// shape: scene.gltf, scene.bin, textures/). Any URI but `data:` is refused,
// absolute ones included: simpler, and an archive that leans on the network
// for half its model isn't one Share should half-open.
const GLTF_SIDE_FILES_MESSAGE = 'This glTF loads its data from other files or links (a .bin, textures), ' +
  'which Share can\'t follow from inside an archive. Export the model as a single .glb, then open that.'


/**
 * Where an upload goes after its archive has been looked into.
 *
 * - `model`: open `file`. `ext`, when set, is the entry's extension, which
 *   the seam must use as the storage type: the entry was chosen by it, and a
 *   header sniff would disagree on formats it can't recognize (a `.gltf`, an
 *   ASCII STL not starting with `solid`). Unset when `file` is the upload
 *   itself, not an archive, which the seam types exactly as before. `bytes`
 *   is the entry's content, set with `ext`, for a caller that wants it
 *   without reading `file` back.
 * - `none`: an archive with nothing Share opens. `exts` is what it holds.
 * - `choose`: several models. `open(entry)` resolves the chosen one.
 *
 * @typedef {{kind: 'model', file: File, ext?: string, bytes?: Uint8Array} |
 *   {kind: 'none', exts: Array<string>} |
 *   {kind: 'choose', entries: Array<import('./zipArchive').ZipEntry>,
 *     revitTextSiblings: Array<string>, open: Function}} ArchiveResolution
 */


/**
 * Look inside an upload, if it is a zip archive, for the model to open.
 *
 * Decided on the HEADER (`PK\x03\x04`), never the name alone: a `.zip` that
 * arrived as `download` or `model.ifc` is still read as one, and a `.zip` that
 * isn't one passes through to be refused as an unknown type. Three kinds of
 * zip pass through untouched, because they are models whose loaders read the
 * archive: one `analyzeHeader` already recognizes (USDZ, SOG, and a binary
 * STL whose free-form header happens to start `PK`), and a `.usdz` / `.sog`
 * by name.
 *
 * An entry is a model when its extension is in `supportedTypes`, exactly —
 * not by `isExtensionSupported`'s unanchored match, under which `.ifcxml`
 * reads as `ifc`.
 *
 * @param {File} file an upload, after the gzip envelope
 * @return {Promise<ArchiveResolution>}
 * @throws {ZipArchiveError} when the archive, or its one model, can't be read
 */
export function resolveArchiveUpload(file) {
  return resolveArchive(file, 0, {remaining: MAX_TOTAL_INFLATED_BYTES})
}


/**
 * @param {File} file
 * @param {number} depth 0 for the upload, 1 for a `.ifczip` inside it
 * @param {{remaining: number}} budget shared by every inflate of one upload
 * @return {Promise<ArchiveResolution>}
 */
async function resolveArchive(file, depth, budget) {
  // Not a Blob at all — a stand-in a caller built by hand — has no bytes to
  // look at, and no archive in it.
  if (typeof file?.slice !== 'function') {
    return {kind: 'model', file}
  }
  let head
  try {
    head = await file.slice(0, Math.min(file.size, HEADER_LIMIT)).arrayBuffer()
  } catch (e) {
    // As in `gzipEnvelope.js`: a handle that can't be read is not this seam's
    // to report. The seam's own read fails on it the way it always did.
    debug().warn('modelArchive#resolveArchive: could not read header; passing through:', e)
    return {kind: 'model', file}
  }
  if (!looksLikeZipBytes(head) ||
      analyzeHeader(head, {fileByteLength: file.size}) !== null ||
      ZIP_MODEL_TYPES.has(nameExtension(file.name))) {
    return {kind: 'model', file}
  }
  const files = await readZipDirectory(file)
  // A 0-byte entry is no model, whatever its name: fflate inflates an empty
  // stream to nothing without complaint, and conway would be handed it.
  // A plain `.zip` inside is never a model: it is a bundle's attachments as
  // often as not (`deliverable.zip` holding `Tower.ifc` and `docs.zip`), and
  // `zip` is in `supportedTypes` only so a hosted one routes. A `.ifczip` is
  // the IFC transport, so it is one, unwrapped once.
  const models = files.filter((entry) => entry.size > 0 && entry.ext !== 'zip' &&
    supportedTypes.includes(entry.ext) && !(depth > 0 && ARCHIVE_TYPES.has(entry.ext)))
  if (models.length === 0) {
    const volume = await dicomVolume(file, files, budget)
    if (volume !== null) {
      return volume
    }
    // Tagged as `uploadExtension` tags a file's own: the text after an
    // entry's last dot can be a name fragment, and this goes on the alert.
    // Empty files are left out: "it contains .ifc" about a 0-byte a.ifc
    // would contradict the "no model" before it, and an archive of nothing
    // but empty files reads, truly, as empty.
    const exts = files.filter((entry) => entry.size > 0)
      .map((entry) => (entry.ext === '' ? '' : extensionTag(entry.ext)))
    return {kind: 'none', exts: [...new Set(exts)]}
  }
  const open = async (entry) => {
    const bytes = await extractZipEntry(file, entry, budget)
    if (entry.ext === 'gltf' && gltfReferencesSideFiles(bytes)) {
      throw new ZipArchiveError(GLTF_SIDE_FILES_MESSAGE)
    }
    // The entry's own name — it is what recents and the load report show —
    // and the archive's timestamp, since the entry's DOS time is local time
    // with no zone.
    // Each a copy of the entry's bytes, so each an allocation that can fail
    // as the reader's can: mapped the same way, to "too large to unpack in
    // this browser" rather than a defect.
    const asFile = () => withArchiveErrors(() => new File([bytes], entry.name, {lastModified: file.lastModified}))
    if (ARCHIVE_TYPES.has(entry.ext)) {
      const inner = await resolveArchive(
        withArchiveErrors(() => namedBlob(bytes, entry.name, file.lastModified)), depth + 1, budget)
      // Not a zip after all: the entry is handed on as the file it is, for
      // the seam to type as it would any upload.
      return inner.kind === 'model' && inner.ext === undefined ? {kind: 'model', file: asFile()} : inner
    }
    return {kind: 'model', file: asFile(), ext: entry.ext, bytes}
  }
  if (models.length === 1) {
    return open(models[0])
  }
  return {kind: 'choose', entries: models, revitTextSiblings: revitTextSiblings(models, files), open}
}


// Entry names a DICOM slice can have. Scanners and PACS exports write
// `.dcm`, `.dicom`, `.ima` (Siemens), or no extension at all (`IM0001`,
// `I1000000`), and some name each file by its SOP Instance UID, whose last
// dotted component then reads as an all-digit extension.
const DICOM_EXTS = new Set(['dcm', 'dicom', 'dic', 'ima', ''])


/**
 * The volume in an archive of DICOM slices, stacked into one `.nrrd`
 * (`loader/dicom.js`), for an archive with no other model in it.
 *
 * Each candidate entry is inflated and kept only if it is a DICOM image; a
 * series is the slices that share a Series Instance UID, image size,
 * orientation, echo and temporal position, and the largest one opens — a
 * study export puts the scan beside a scout of a few slices. What reaches
 * the seam is a `File` named for the archive (`CT1.zip` → `CT1.nrrd`),
 * typed `nrrd`: the archive is the only name the series has.
 *
 * The candidates are guesses (any entry with no extension), so looking at
 * one must not change what an archive with no DICOM in it is told:
 *
 * - An entry is inflated against a scratch budget (the whole per-upload
 *   ceiling), and charged to the upload's own only once it has proved to be
 *   a DICOM image. A `LICENSE` or `Makefile` costs nothing, and can't fail
 *   for room the slices before it used.
 * - An entry that can't be extracted (encrypted, an unsupported method,
 *   past the ceiling) is skipped while it might be anything. It is raised
 *   only once the archive has proved to hold DICOM, where it may be a
 *   slice, and a series missing slices must not open as if whole; or when
 *   it is named as DICOM (`.dcm`).
 * - Otherwise an archive with no DICOM image falls through to the "holds no
 *   model" alert exactly as before.
 *
 * @param {Blob} file the archive
 * @param {Array<object>} files its entries (`zipArchive.js#ZipEntry`)
 * @param {{remaining: number}} budget
 * @return {Promise<object|null>} an `ArchiveResolution` of kind `model`, or
 *   null when the archive holds no DICOM image
 * @throws {ZipArchiveError} for a series that can't be read or stacked
 */
async function dicomVolume(file, files, budget) {
  const candidates = files.filter((entry) => entry.size > 0 &&
    (DICOM_EXTS.has(entry.ext) || /^\d+$/.test(entry.ext)))
  const slices = []
  let refusal = null
  let unextracted = null
  let unextractedNamedDicom = null
  for (const entry of candidates) {
    let bytes
    try {
      // A scratch budget of the whole per-upload ceiling, not what is left
      // of the real one: a guess mustn't fail for room the slices used up.
      bytes = await extractZipEntry(file, entry, {remaining: MAX_TOTAL_INFLATED_BYTES})
    } catch (e) {
      if (!(e instanceof ZipArchiveError)) {
        throw e
      }
      unextracted = unextracted ?? e
      if (entry.ext !== '' && !/^\d+$/.test(entry.ext)) {
        unextractedNamedDicom = unextractedNamedDicom ?? e
      }
      continue
    }
    if (!looksLikeDicom(bytes)) {
      continue
    }
    if (bytes.length > budget.remaining) {
      throw new ZipArchiveError(expandsPastMessage())
    }
    budget.remaining -= bytes.length
    try {
      const slice = parseDicomSlice(bytes)
      if (slice !== null) {
        slices.push(slice)
      }
    } catch (e) {
      if (!(e instanceof DicomError)) {
        throw e
      }
      // One unreadable slice shouldn't sink a series of readable ones, so
      // the refusal is kept, and raised only if nothing could be read.
      refusal = refusal ?? e
    }
  }
  if (slices.length === 0) {
    if (refusal !== null) {
      throw new ZipArchiveError(refusal.message)
    }
    if (unextractedNamedDicom !== null) {
      throw unextractedNamedDicom
    }
    return null
  }
  if (unextracted !== null) {
    throw unextracted
  }
  const [series] = groupSeries(slices)
  slices.length = 0
  let nrrd
  try {
    nrrd = withArchiveErrors(() => dicomSeriesToNrrd(series))
  } catch (e) {
    throw e instanceof DicomError ? new ZipArchiveError(e.message) : e
  }
  const name = `${withoutExtension(String(file.name || 'volume.zip'))}.nrrd`
  debug().log(`modelArchive#dicomVolume: stacked ${series.length} DICOM slices`)
  // No `bytes` beside the File, unlike an entry's resolution: the File is a
  // copy, and holding the NRRD array too would keep a second whole volume
  // alive while the seam writes the File to OPFS.
  return {
    kind: 'model',
    file: withArchiveErrors(() => new File([nrrd], name, {lastModified: file.lastModified})),
    ext: 'nrrd',
  }
}


/**
 * Carry an upload through its archive, if it is one, and on to the seam's own
 * open — directly, through the entry chooser, or to a refusal.
 *
 * A file that is not an archive reaches `open` exactly as it did before this
 * existed, with no `ext`, and whatever `open` throws for it still propagates
 * to the seam. Looking inside the archive never throws: every failure there
 * ends in an alert and `refused`.
 *
 * @param {File} file an upload, after the gzip envelope
 * @param {object} seam
 * @param {'drop'|'picker'} seam.entry which way the file arrived, for the alert
 * @param {Function} seam.alert hands an alert to AlertDialog (`setAlert`)
 * @param {Function} seam.open `(file, ext?) => Promise`: the seam's open
 *   of a model file
 * @return {Promise<'opening'|'choosing'|'refused'>} how this call ended. On
 *   `choosing` the chooser is up and the seam's work resumes, if the user
 *   chooses, inside the chooser's click.
 */
export function openUploadThroughArchive(file, {entry, alert, open}) {
  const settle = async (pending) => {
    let resolution
    try {
      resolution = await pending
    } catch (e) {
      if (!(e instanceof ZipArchiveError)) {
        // A defect, not the archive's fault (the reader maps everything an
        // archive can cause to a ZipArchiveError). Still the end of this
        // upload, so it still ends in the dialog — as the Error it is, which
        // AlertDialog reports to Sentry — rather than escaping the seam and
        // leaving the user with nothing.
        debug().error('modelArchive#openUploadThroughArchive: could not look inside the upload:', e)
        alert(e instanceof Error ? e : new Error(String(e)))
        return 'refused'
      }
      // A refusal of the user's input, not a defect: one info event like
      // every other unopenable upload (`unrecognizedFormat.js`), and the
      // reason in the dialog.
      alert({...unrecognizedFormatAlert(e.message, file.name, entry), archive: {problem: e.message}})
      return 'refused'
    }
    if (resolution.kind === 'model') {
      await open(resolution.file, resolution.ext)
      return 'opening'
    }
    if (resolution.kind === 'none') {
      // The console's record of which file, as the drop seam keeps for any
      // rejected upload; the alert carries only extensions. consoleFileName
      // marks the name for withholding from Sentry's breadcrumb of this line
      // (`privacy/sentryRedaction.js`).
      debug(WARN).warn(
        `modelArchive: ${consoleFileName(file.name)} holds no model Share opens (${resolution.exts.join(', ')})`)
      alert(noModelInArchiveAlert(file.name, entry, resolution.exts))
      return 'refused'
    }
    alert({
      type: ARCHIVE_ENTRY_CHOICE,
      entries: resolution.entries,
      revitTextSiblings: resolution.revitTextSiblings,
      onChoose: (chosen) => settle(resolution.open(chosen)),
    })
    return 'choosing'
  }
  return settle(resolveArchiveUpload(file))
}


/**
 * The alert for an archive with no model in it. Still an
 * `unrecognizedFormat` alert — counted once in Sentry, tagged by the file's
 * extension (`zip` for a `.zip`), with no file or entry name anywhere in its
 * tags — and carrying what the archive holds, so the dialog can say so
 * ({@link archiveGuidance}).
 *
 * @param {string} fileName the upload's name, reduced to its extension
 * @param {'drop'|'picker'} entry
 * @param {Array<string>} exts distinct extensions inside, `''` for none
 * @return {object}
 */
export function noModelInArchiveAlert(fileName, entry, exts) {
  const message = archiveGuidance({exts}).lines[0]
  return {...unrecognizedFormatAlert(message, fileName, entry), archive: {exts}}
}


/**
 * The model inside a downloaded archive — from GitHub, Drive, a locally
 * hosted file or a pasted URL — for `Loader#load` to parse.
 *
 * The load seam's half of opening zips the same way wherever they come from:
 * uploads are unwrapped at the upload seams (`openUploadThroughArchive`);
 * a download reaches `Loader#load` as the bytes it is, whatever its name
 * (`.zip`, `.ifc.zip`, `.ifczip`, or a zip renamed `model.ifc`), and comes
 * through here. It is the same resolution the upload seams use
 * (`resolveArchiveUpload`): one model opens, typed by its extension (header
 * sniffing types an entry with none); a DICOM series opens as its volume;
 * zip-based model formats (USDZ, SOG) pass through as themselves.
 *
 * What a download can't do that an upload can: put up the entry chooser.
 * The chooser resumes an upload with the entry picked, but a hosted link has
 * no way to name an entry inside an archive, so a link to an archive of
 * several models would have nothing to reopen. Several models are refused,
 * naming them.
 *
 * @param {ArrayBuffer|Uint8Array} modelData the downloaded bytes
 * @param {string} [name] the download's file name, for a DICOM volume's name
 * @return {Promise<object|null>} `{modelData, type}`: the model inside, as
 *   an ArrayBuffer, and its format tag; null when the bytes aren't an
 *   archive to look inside (not a zip, or a zip-based model format)
 * @throws {ZipArchiveError} when there isn't exactly one model inside, or the
 *   archive can't be read
 */
export async function unwrapHostedArchive(modelData, name = 'model.zip') {
  const outer = namedBlob(modelData, name, Date.now())
  const resolution = await resolveArchiveUpload(outer)
  if (resolution.kind === 'model' && resolution.ext === undefined && resolution.file === outer) {
    return null
  }
  if (resolution.kind === 'model') {
    // An entry's bytes are exactly the entry (`extractZipEntry` sizes the
    // buffer to it); a DICOM volume's resolution carries only its File.
    const bytes = resolution.bytes ?? new Uint8Array(await readBlob(resolution.file))
    const buffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ?
      bytes.buffer : bytes.slice().buffer
    // A nested `.ifczip` that wasn't a zip after all comes back untyped, as
    // the seams' sniff expects: typed here by its header, as they would.
    const type = resolution.ext ??
      analyzeHeader(buffer.slice(0, HEADER_LIMIT), {fileByteLength: buffer.byteLength})
    if (type === null) {
      throw new ZipArchiveError(NO_MODEL_MESSAGE)
    }
    return {modelData: buffer, type}
  }
  if (resolution.kind === 'choose') {
    throw new ZipArchiveError(severalModelsMessage(resolution.entries.length),
      {dialogText: severalModelsMessage(resolution.entries.length, resolution.entries)})
  }
  // The extension list is the archive's content, tagged but still taken from
  // the user's entry names (`.acmecorp`), so only the dialog gets it.
  throw new ZipArchiveError(NO_MODEL_MESSAGE, {dialogText: archiveGuidance({exts: resolution.exts}).lines[0]})
}


// What sinks get for a hosted archive with no model in it.
const NO_MODEL_MESSAGE = 'This archive has no model Share can open.'


// How many of an archive's models the several-models refusal names.
const NAMED_MODELS = 5


/**
 * The refusal for a hosted archive of several models. Without `entries` it
 * names none of them, which is the form sinks get (`ZipArchiveError`).
 *
 * @param {number} count how many models the archive holds
 * @param {Array<object>} [entries] the models, to name the first few
 * @return {string}
 */
function severalModelsMessage(count, entries) {
  let listed = ''
  if (entries !== undefined) {
    const names = entries.slice(0, NAMED_MODELS).map((entry) => entry.path)
    const more = count > NAMED_MODELS ? ` and ${count - NAMED_MODELS} more` : ''
    listed = ` (${names.join(', ')}${more})`
  }
  return `This archive holds ${count} models${listed}. ` +
    'A link opens an archive of one model. Unpack it and open the model you want, ' +
    'or open the archive from your computer to choose one.'
}


/**
 * @param {Blob} blob
 * @return {Promise<ArrayBuffer>} its bytes (through FileReader where a Blob
 *   can't read itself, as jsdom's File can't)
 */
function readBlob(blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}


/**
 * The `.ifc` models that have a `.txt` of the same name beside them — the
 * sibling Revit writes next to an IFC export, which users open in place of
 * the `.ifc` (Share#1087). The chooser names them, so a user who knows the
 * pair by the `.txt` sees why it isn't in the list.
 *
 * @param {Array<object>} models the archive's model entries
 * @param {Array<object>} files all its entries
 * @return {Array<string>} the `.ifc` entries' paths, in archive order
 */
function revitTextSiblings(models, files) {
  const texts = new Set(files.filter((f) => f.ext === 'txt').map((f) => withoutExtension(f.path).toLowerCase()))
  return models
    .filter((m) => m.ext === 'ifc' && texts.has(withoutExtension(m.path).toLowerCase()))
    .map((m) => m.path)
}


/**
 * @param {string} path
 * @return {string} the path less its last extension
 */
function withoutExtension(path) {
  const dot = path.lastIndexOf('.')
  return dot > path.lastIndexOf('/') ? path.slice(0, dot) : path
}


/**
 * Whether a `.gltf`'s JSON loads data from anywhere but itself — a file
 * beside it, or a URL — rather than carrying it all inline. Only `data:` URIs are inline; a buffer with no `uri` is a GLB's
 * own chunk, which a `.gltf` has none of. JSON that doesn't parse is left for
 * the loader to refuse: it says more than this would.
 *
 * @param {Uint8Array} bytes the entry
 * @return {boolean}
 */
function gltfReferencesSideFiles(bytes) {
  let json
  try {
    json = JSON.parse(new TextDecoder('utf-8').decode(bytes))
  } catch {
    return false
  }
  const listed = (key) => (Array.isArray(json?.[key]) ? json[key] : [])
  return [...listed('buffers'), ...listed('images')]
    // `data:` in any case, as three's LoaderUtils matches it (`/^data:/i`).
    // Everything else — relative paths and absolute URLs alike — is a file
    // this entry doesn't carry.
    .some((item) => typeof item?.uri === 'string' && !/^data:/i.test(item.uri))
}


/**
 * Run an allocation, as a reader failure would be mapped if it failed
 * (`zipArchive.js#asArchiveError`).
 *
 * @param {Function} allocate
 * @return {any} what it returned
 * @throws {ZipArchiveError} for a failure the archive or the device caused
 */
function withArchiveErrors(allocate) {
  try {
    return allocate()
  } catch (e) {
    throw asArchiveError(e)
  }
}


/**
 * Bytes this module reads back itself, as the File-shaped thing
 * {@link resolveArchive} reads: a Blob with a `name` and `lastModified`.
 * Only a `File` is ever handed to a seam; this one never leaves the module.
 * (A plain Blob also reads under Jest, where jsdom's `File` can't be read.)
 *
 * @param {ArrayBuffer|Uint8Array} bytes
 * @param {string} name
 * @param {number} lastModified
 * @return {Blob}
 */
function namedBlob(bytes, name, lastModified) {
  return Object.assign(new Blob([bytes]), {name, lastModified})
}


/**
 * @param {string} name
 * @return {string} its last extension, lowercased, or ''
 */
function nameExtension(name) {
  const dot = String(name || '').lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}
