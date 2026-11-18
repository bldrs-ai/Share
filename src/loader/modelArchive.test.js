/* eslint-disable no-magic-numbers */
// Which entry of an archive is the model, and what each seam is told — over
// archives written by fflate's `zipSync`, not by the code under test.
import fs from 'fs'
import path from 'path'
import {NRRDLoader} from 'three/examples/jsm/loaders/NRRDLoader.js'
import {unzipSync, zipSync} from 'three/examples/jsm/libs/fflate.module.js'
import {
  ARCHIVE_ENTRY_CHOICE,
  noModelInArchiveAlert,
  openUploadThroughArchive,
  resolveArchiveUpload,
  unwrapIfcZip,
} from './modelArchive'
import {redactBreadcrumb} from '../privacy/sentryRedaction'
import {WARN, disableDebug, setDebugLevel} from '../utils/debug'
import {ZipArchiveError} from './zipArchive'


// The per-upload total, adjustable for the one test that has to reach it
// without inflating 512 MiB. Read through a getter because modelArchive reads
// the constant at call time.
let mockTotalInflatedBytes
// And a failure the directory read can be made to throw, standing in for a
// defect that isn't the archive's: the reader maps everything an archive can
// cause to a ZipArchiveError, so a real one can't be produced from bytes.
let mockDirectoryError
jest.mock('./zipArchive', () => {
  const actual = jest.requireActual('./zipArchive')
  return {
    ...actual,
    get MAX_TOTAL_INFLATED_BYTES() {
      return mockTotalInflatedBytes ?? actual.MAX_TOTAL_INFLATED_BYTES
    },
    readZipDirectory: (...args) => (mockDirectoryError ?
      Promise.reject(mockDirectoryError) : actual.readZipDirectory(...args)),
  }
})


const PICKED_AT = 1_700_000_000_000


/**
 * UTF-8 in this realm's Uint8Array (fflate tells files from folders by
 * `instanceof`; TextEncoder's are Node's under jest-fixed-jsdom).
 *
 * @param {string} text
 * @return {Uint8Array}
 */
function utf8(text) {
  return new Uint8Array(new TextEncoder().encode(text))
}


const IFC = utf8('ISO-10303-21;\nHEADER;\nFILE_SCHEMA((\'IFC4\'));\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n')
const STEP = utf8('ISO-10303-21;\nHEADER;\nFILE_SCHEMA((\'AUTOMOTIVE_DESIGN\'));\nENDSEC;\n')
const GLB = utf8('glTF and its chunks')
const PDF = utf8('%PDF-1.7')


/**
 * An upload as both seams see one: a Blob with a name and a timestamp.
 *
 * @param {Uint8Array} bytes
 * @param {string} name
 * @return {Blob}
 */
function upload(bytes, name) {
  return Object.assign(new Blob([bytes]), {name, lastModified: PICKED_AT})
}


/**
 * A `File` the module made, read the way jsdom's File allows.
 *
 * @param {Blob} file
 * @return {Promise<string>}
 */
function textOf(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new TextDecoder().decode(new Uint8Array(reader.result)))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}


/**
 * A `File` the module made, as an ArrayBuffer.
 *
 * @param {Blob} file
 * @return {Promise<ArrayBuffer>}
 */
function bufferOf(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}


/**
 * A zip with one entry's compression method rewritten, in its local header
 * and its directory record: how an archive with an entry Share can't extract
 * (Deflate64, LZMA) is made from one fflate wrote.
 *
 * @param {Uint8Array} zip
 * @param {string} name the entry's path
 * @param {number} method
 * @return {Uint8Array}
 */
function withMethod(zip, name, method) {
  const out = zip.slice()
  const view = new DataView(out.buffer)
  const target = new TextEncoder().encode(name)
  const nameAt = (at) => target.every((b, i) => out[at + i] === b)
  for (let at = 0; at + 46 <= out.length; at++) {
    const sig = view.getUint32(at, true)
    if (sig === 0x04034b50 && view.getUint16(at + 26, true) === target.length && nameAt(at + 30)) {
      view.setUint16(at + 8, method, true)
    } else if (sig === 0x02014b50 && view.getUint16(at + 28, true) === target.length && nameAt(at + 46)) {
      view.setUint16(at + 10, method, true)
    }
  }
  return out
}


/**
 * A resolution as plain data, for assertions. Jest's failure diff deep-copies
 * what it prints, and a jsdom File inside a resolution aborts the worker
 * ("Assertion failed: isolate_data") instead of printing — so a failing
 * assertion over the raw object would crash the run, not report it.
 *
 * @param {object} resolution from resolveArchiveUpload
 * @param {Blob} [input] the upload, to say whether `file` IS it
 * @return {object}
 */
function summary(resolution, input) {
  const {kind, ext, exts, entries, file} = resolution
  return {
    kind,
    ...(ext !== undefined ? {ext} : {}),
    ...(exts !== undefined ? {exts} : {}),
    ...(entries !== undefined ? {entries: entries.map((e) => e.path)} : {}),
    ...(file !== undefined ? {name: file.name, isInput: file === input} : {}),
  }
}


describe('modelArchive', () => {
  afterEach(() => {
    mockTotalInflatedBytes = undefined
    mockDirectoryError = undefined
  })

  describe('resolveArchiveUpload', () => {
    it('passes a file that is not a zip through as itself, untyped', async () => {
      const file = upload(IFC, 'Tower.ifc')
      expect(summary(await resolveArchiveUpload(file), file)).toEqual({kind: 'model', name: 'Tower.ifc', isInput: true})
    })

    it('opens the one model in an archive, under the entry\'s name and type', async () => {
      const zip = zipSync({'export/Tower.ifc': IFC, 'export/notes.pdf': PDF})
      const resolved = await resolveArchiveUpload(upload(zip, 'Tower ifc.zip'))
      expect(summary(resolved)).toEqual({kind: 'model', ext: 'ifc', name: 'Tower.ifc', isInput: false})
      expect(resolved.file.lastModified).toBe(PICKED_AT)
      expect(await textOf(resolved.file)).toBe(new TextDecoder().decode(IFC))
    })

    it('goes by the header, not the name: a zip named anything still opens', async () => {
      const zip = zipSync({'part.stp': STEP})
      for (const name of ['download', 'part.stp', 'part.bin']) {
        const resolved = await resolveArchiveUpload(upload(zip, name))
        expect(summary(resolved)).toEqual({kind: 'model', ext: 'stp', name: 'part.stp', isInput: false})
      }
    })

    it('opens a .ifczip, and a .ifczip inside a .zip', async () => {
      const ifczip = zipSync({'Tower.ifc': IFC})
      expect(summary(await resolveArchiveUpload(upload(ifczip, 'Tower.ifczip'))))
        .toEqual({kind: 'model', ext: 'ifc', name: 'Tower.ifc', isInput: false})
      const bundle = zipSync({'Tower.ifczip': ifczip, 'readme.pdf': PDF})
      const resolved = await resolveArchiveUpload(upload(bundle, 'bundle.zip'))
      expect(summary(resolved)).toEqual({kind: 'model', ext: 'ifc', name: 'Tower.ifc', isInput: false})
    })

    it('charges a .ifczip inside a .zip against one total', async () => {
      const ifczip = zipSync({'Tower.ifc': [IFC, {level: 0}]}, {level: 0})
      const bundle = zipSync({'Tower.ifczip': [ifczip, {level: 0}]})
      // Room for either inflate alone, not for both.
      mockTotalInflatedBytes = ifczip.length + IFC.length - 1
      const message = await resolveArchiveUpload(upload(bundle, 'bundle.zip')).then(() => null, (e) => e.message)
      expect(message).toMatch(/unpacks to more than/)
      mockTotalInflatedBytes = ifczip.length + IFC.length
      expect(summary(await resolveArchiveUpload(upload(bundle, 'bundle.zip'))))
        .toEqual({kind: 'model', ext: 'ifc', name: 'Tower.ifc', isInput: false})
    })

    it('offers a choice when there are several models, and opens the one chosen', async () => {
      const zip = zipSync({'a/Tower.ifc': IFC, 'a/Tower.txt': utf8('Revit'), 'b/Tower.ifc': IFC, 'part.glb': GLB})
      const resolved = await resolveArchiveUpload(upload(zip, 'models.zip'))
      expect(summary(resolved)).toEqual({kind: 'choose', entries: ['a/Tower.ifc', 'b/Tower.ifc', 'part.glb']})
      // Only the .ifc with a same-named .txt beside it.
      expect(resolved.revitTextSiblings).toEqual(['a/Tower.ifc'])
      const chosen = await resolved.open(resolved.entries[2])
      expect(summary(chosen)).toEqual({kind: 'model', ext: 'glb', name: 'part.glb', isInput: false})
    })

    it('says what an archive holds when none of it is a model', async () => {
      const zip = zipSync({'plan.dwg': PDF, 'spec.pdf': PDF, 'more.pdf': PDF, 'LICENSE': PDF})
      expect(summary(await resolveArchiveUpload(upload(zip, 'drawings.zip')))).toEqual({kind: 'none', exts: ['dwg', 'pdf', '']})
      expect(summary(await resolveArchiveUpload(upload(zipSync({}), 'empty.zip')))).toEqual({kind: 'none', exts: []})
    })

    it('matches entry extensions exactly, and ignores Finder\'s metadata', async () => {
      // `isExtensionSupported('ifcxml')` is true (an unanchored match); as an
      // entry it is not a model. `__MACOSX/._Tower.ifc` is not one either.
      const zip = zipSync({'Tower.ifcxml': IFC, '__MACOSX/._Tower.ifc': PDF, '._Tower.ifc': PDF})
      expect(summary(await resolveArchiveUpload(upload(zip, 'x.zip')))).toEqual({kind: 'none', exts: ['ifcxml']})
    })

    it('passes over a 0-byte entry, which is no model whatever its name', async () => {
      // fflate inflates an empty deflate stream to nothing, without error, so
      // this used to hand conway an empty "a.ifc".
      const zip = zipSync({'a.ifc': new Uint8Array(0), 'b.glb': GLB})
      expect(summary(await resolveArchiveUpload(upload(zip, 'x.zip'))))
        .toEqual({kind: 'model', ext: 'glb', name: 'b.glb', isInput: false})
      // Empty files aren't listed either, or the dialog would say an archive
      // with "no model" contains .ifc.
      const onlyEmpty = zipSync({'a.ifc': new Uint8Array(0), 'notes.txt': new Uint8Array(0), 'plan.pdf': PDF})
      expect(summary(await resolveArchiveUpload(upload(onlyEmpty, 'x.zip')))).toEqual({kind: 'none', exts: ['pdf']})
      const alert = jest.fn()
      await openUploadThroughArchive(upload(zipSync({'a.ifc': new Uint8Array(0)}), 'x.zip'), {entry: 'drop', alert, open: jest.fn()})
      expect(alert.mock.calls[0][0].message).toBe('This archive is empty.')
      expect(alert.mock.calls[0][0].archive).toEqual({exts: []})
    })

    it('refuses a .gltf whose data sits in files beside it, which can\'t be found once it is out', async () => {
      // Sketchfab's download shape. Out of the archive, `scene.bin` resolves
      // to a /share/v/local-only/ URL the SPA answers with index.html.
      const gltf = (json) => utf8(JSON.stringify({asset: {version: '2.0'}, ...json}))
      const sketchfab = zipSync({
        'scene.gltf': gltf({buffers: [{uri: 'scene.bin', byteLength: 4}]}),
        'scene.bin': new Uint8Array(4),
        'textures/base.png': PDF,
      })
      await expect(resolveArchiveUpload(upload(sketchfab, 'model.zip'))).rejects.toThrow(
        'This glTF loads its data from other files or links (a .bin, textures), which Share can\'t follow from ' +
        'inside an archive. Export the model as a single .glb, then open that.')
      // An absolute URL is refused too: the simpler rule, and the safer.
      const linked = zipSync({'a.gltf': gltf({buffers: [{uri: 'https://example.test/a.bin', byteLength: 4}]})})
      await expect(resolveArchiveUpload(upload(linked, 'a.zip'))).rejects.toThrow(ZipArchiveError)
      const texturesOnly = zipSync({'a.gltf': gltf({images: [{uri: 'textures/base.png'}]})})
      await expect(resolveArchiveUpload(upload(texturesOnly, 'a.zip'))).rejects.toThrow(ZipArchiveError)
      // Everything inline (`data:` URIs) is a whole model, and opens.
      const inline = zipSync({'a.gltf': gltf({
        buffers: [{uri: 'data:application/octet-stream;base64,AAAAAA==', byteLength: 4}],
        images: [{uri: 'data:image/png;base64,AAAA'}],
      })})
      expect(summary(await resolveArchiveUpload(upload(inline, 'a.zip'))))
        .toEqual({kind: 'model', ext: 'gltf', name: 'a.gltf', isInput: false})
    })

    it('takes a `DATA:` URI as inline, in any case, as three\'s loader does', async () => {
      const gltf = utf8(JSON.stringify({asset: {version: '2.0'},
        buffers: [{uri: 'DATA:application/octet-stream;base64,AAAAAA==', byteLength: 4}],
        images: [{uri: 'Data:image/png;base64,AAAA'}]}))
      expect(summary(await resolveArchiveUpload(upload(zipSync({'a.gltf': gltf}), 'a.zip'))))
        .toEqual({kind: 'model', ext: 'gltf', name: 'a.gltf', isInput: false})
    })

    it('says the device is out of room when copying the entry into its File fails', async () => {
      const RealFile = global.File
      global.File = function() {
        throw new RangeError('Array buffer allocation failed')
      }
      try {
        await expect(resolveArchiveUpload(upload(zipSync({'Tower.ifc': IFC}), 'Tower.zip'))).rejects.toThrow(
          'This model is too large to unpack in this browser.')
      } finally {
        global.File = RealFile
      }
    })

    it('tags what an archive holds as extensions only, never name text', async () => {
      // The text after an entry's last dot can be part of a name; it goes on
      // the alert as `other`, the same tag a file's own would get.
      const zip = zipSync({'Client.Acme Corp Tower Final': PDF, 'plan.PDF': PDF, 'x.thisistoolongtobeone': PDF})
      expect(summary(await resolveArchiveUpload(upload(zip, 'x.zip')))).toEqual({kind: 'none', exts: ['other', 'pdf']})
      expect(noModelInArchiveAlert('x.zip', 'drop', ['other', 'pdf']).message).toBe(
        'This archive has no model Share can open (it contains .pdf and 1 other file type).')
    })

    it('leaves zip-based model formats to their own loaders', async () => {
      // USDZ: recognized by its first entry. SOG: by name, when its first
      // entry doesn't give it away. A binary STL whose free-form header starts
      // `PK\x03\x04`: by the triangle count, before any magic.
      const usdz = upload(zipSync({'scene.usda': utf8('#usda 1.0')}, {level: 0}), 'scene.zip')
      expect(summary(await resolveArchiveUpload(usdz), usdz)).toEqual({kind: 'model', name: 'scene.zip', isInput: true})
      const sog = upload(zipSync({'means.webp': PDF, 'meta.json': utf8('{}')}), 'splat.sog')
      expect(summary(await resolveArchiveUpload(sog), sog)).toEqual({kind: 'model', name: 'splat.sog', isInput: true})
      const stl = new Uint8Array(84 + 50)
      stl.set([0x50, 0x4b, 3, 4])
      new DataView(stl.buffer).setUint32(80, 1, true)
      const stlFile = upload(stl, 'part.stl')
      expect(summary(await resolveArchiveUpload(stlFile), stlFile)).toEqual({kind: 'model', name: 'part.stl', isInput: true})
    })
  })

  describe('a DICOM series', () => {
    // pydicom's phantom (tools/models/makeDicomPhantom.py): 32 extension-less
    // slices in shuffled order, a one-slice scout series and a README.
    const phantom = () => new Uint8Array(fs.readFileSync(
      path.join(__dirname, '../../testdata/models/dicom/phantom-ct.zip')))

    it('is stacked into one .nrrd named for the archive, from the largest series', async () => {
      const resolved = await resolveArchiveUpload(upload(phantom(), 'CT1.zip'))
      expect(summary(resolved)).toEqual({kind: 'model', ext: 'nrrd', name: 'CT1.nrrd', isInput: false})
      expect(resolved.file.lastModified).toBe(PICKED_AT)
      // The File is the NRRD (no `bytes` beside it, which would hold the
      // volume twice), which three's loader reads
      // as the 40 × 48 × 32 scan, not the 16 × 16 scout.
      expect((await textOf(resolved.file)).startsWith('NRRD0004\n')).toBe(true)
      expect(resolved.bytes).toBeUndefined()
      const volume = new NRRDLoader().parse(await bufferOf(resolved.file))
      expect(volume.dimensions).toEqual([40, 48, 32])
    })

    it('loses to a model in the same archive', async () => {
      const zip = zipSync({...unzipSync(phantom()), 'Tower.ifc': IFC})
      expect(summary(await resolveArchiveUpload(upload(zip, 'CT1.zip'))))
        .toEqual({kind: 'model', ext: 'ifc', name: 'Tower.ifc', isInput: false})
    })

    it('reads slices named by UID, and .dcm, and leaves extension-less files that aren\'t DICOM', async () => {
      const slices = Object.entries(unzipSync(phantom())).filter(([p]) => p.includes('/DICOM/'))
      const renamed = Object.fromEntries(slices.map(([, bytes], k) =>
        [k % 2 ? `1.2.840.113619.2.55.${k}` : `slice${k}.DCM`, bytes]))
      const resolved = await resolveArchiveUpload(upload(zipSync({...renamed, LICENSE: PDF}), 'study.zip'))
      expect(summary(resolved)).toEqual({kind: 'model', ext: 'nrrd', name: 'study.nrrd', isInput: false})
      expect(new NRRDLoader().parse(await bufferOf(resolved.file)).dimensions).toEqual([40, 48, 32])
    })

    it('ends an unreadable series in the dialog, with the reason', async () => {
      // The phantom's first slice, re-labelled Explicit VR Big Endian (a UID
      // of the same length, so the element's length still holds). Its pixel
      // data is still little endian, but the reader refuses on the transfer
      // syntax first. (RLE was the example before it became readable.)
      const [slice] = Object.values(unzipSync(phantom())).filter((b) => b.length > 1000)
      const relabelled = slice.slice()
      const text = new TextDecoder('latin1').decode(relabelled)
      const at = text.indexOf('1.2.840.10008.1.2.1')
      relabelled.set(new TextEncoder().encode('1.2.840.10008.1.2.2'), at)
      const alert = jest.fn()
      const outcome = await openUploadThroughArchive(upload(zipSync({IM0001: relabelled}), 'CT1.zip'),
        {entry: 'drop', alert, open: jest.fn()})
      expect(outcome).toBe('refused')
      expect(alert.mock.calls[0][0].archive.problem).toMatch(/big-endian \(transfer syntax 1\.2\.840\.10008\.1\.2\.2\)/)
    })

    it('doesn\'t change what an archive with no DICOM is told, even if an entry can\'t be extracted', async () => {
      // `LICENSE` is a candidate (no extension), and Deflate64 (9) is a
      // method Share can't read. Looking at it mustn't turn "holds no model"
      // into "compressed with Deflate64".
      const zip = withMethod(zipSync({'LICENSE': PDF, 'plan.pdf': PDF}), 'LICENSE', 9)
      expect(summary(await resolveArchiveUpload(upload(zip, 'docs.zip')))).toEqual({kind: 'none', exts: ['', 'pdf']})
    })

    it('refuses a DICOM archive with an entry it can\'t extract, rather than open a series that may miss it', async () => {
      const entries = unzipSync(phantom())
      const [aSlice] = Object.keys(entries).filter((p) => p.includes('/DICOM/'))
      const zip = withMethod(zipSync(entries), aSlice, 9)
      await expect(resolveArchiveUpload(upload(zip, 'CT1.zip'))).rejects.toThrow(/Deflate64/)
    })

    it('charges the budget for DICOM slices only', async () => {
      const entries = unzipSync(phantom())
      const sliceBytes = Object.values(entries).filter((b) => b.length > 1000)
        .reduce((n, b) => n + b.length, 0)
      // A non-DICOM candidate: if looking at it were charged, the slices
      // after it would not fit in a budget of exactly their size.
      // First in the archive, so it is looked at before any slice.
      const zip = zipSync({LICENSE: new Uint8Array(64 * 1024), ...entries})
      mockTotalInflatedBytes = sliceBytes
      expect(summary(await resolveArchiveUpload(upload(zip, 'CT1.zip'))).ext).toBe('nrrd')
      mockTotalInflatedBytes = sliceBytes - 1
      await expect(resolveArchiveUpload(upload(zip, 'CT1.zip'))).rejects.toThrow(/unpacks to more than/)
    })

    it('reaches the seam\'s open typed nrrd', async () => {
      const open = jest.fn()
      const outcome = await openUploadThroughArchive(upload(phantom(), 'CT1.zip'),
        {entry: 'picker', alert: jest.fn(), open})
      expect(outcome).toBe('opening')
      expect(open.mock.calls[0][0].name).toBe('CT1.nrrd')
      expect(open.mock.calls[0][1]).toBe('nrrd')
    })
  })

  describe('openUploadThroughArchive', () => {
    it('hands a non-archive straight to the seam, as before', async () => {
      const file = upload(GLB, 'part.glb')
      const open = jest.fn()
      const alert = jest.fn()
      expect(await openUploadThroughArchive(file, {entry: 'drop', alert, open})).toBe('opening')
      expect(open).toHaveBeenCalledTimes(1)
      expect(open.mock.calls[0][0] === file).toBe(true)
      expect(open.mock.calls[0][1]).toBeUndefined()
      expect(alert).not.toHaveBeenCalled()
    })

    it('puts up the chooser for several models, and finishes through the seam on a choice', async () => {
      const open = jest.fn()
      const alert = jest.fn()
      const zip = zipSync({'Tower.ifc': IFC, 'part.glb': GLB})
      expect(await openUploadThroughArchive(upload(zip, 'models.zip'), {entry: 'picker', alert, open})).toBe('choosing')
      expect(open).not.toHaveBeenCalled()
      const [choice] = alert.mock.calls[0]
      expect(choice.type).toBe(ARCHIVE_ENTRY_CHOICE)
      expect(choice.entries.map((e) => e.name)).toEqual(['Tower.ifc', 'part.glb'])
      expect(await choice.onChoose(choice.entries[1])).toBe('opening')
      expect(open).toHaveBeenCalledTimes(1)
      const [file, ext] = open.mock.calls[0]
      expect(file.name).toBe('part.glb')
      expect(ext).toBe('glb')
    })

    it('refuses an archive with no model as an unrecognized format, naming no file', async () => {
      const alert = jest.fn()
      const zip = zipSync({'Tower.rvt': PDF, 'Tower.pdf': PDF})
      expect(await openUploadThroughArchive(upload(zip, 'Secret Tower.zip'), {entry: 'drop', alert, open: jest.fn()}))
        .toBe('refused')
      const [refusal] = alert.mock.calls[0]
      expect(refusal).toEqual({
        type: 'unrecognizedFormat',
        message: 'This archive has no model Share can open (it contains .rvt and .pdf).',
        ext: 'zip',
        entry: 'drop',
        archive: {exts: ['rvt', 'pdf']},
      })
      expect(JSON.stringify(refusal)).not.toMatch(/Secret|Tower/)
    })

    // The console keeps which zip it was, for the user; Sentry records that
    // line as a breadcrumb, and the producer's real output must come out of
    // the redactor with the name withheld (privacy/sentryRedaction.js).
    it('names the zip on the console in a line Sentry withholds the name from', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      // setupTests silences debug(); the production level is WARN.
      setDebugLevel(WARN)
      let line
      try {
        const zip = zipSync({'Tower.rvt': PDF})
        await openUploadThroughArchive(upload(zip, 'Secret "Tower" v2.zip'), {entry: 'drop', alert: jest.fn(), open: jest.fn()})
        line = warnSpy.mock.calls.map((args) => args.join(' ')).find((text) => text.startsWith('modelArchive:'))
      } finally {
        disableDebug()
        warnSpy.mockRestore()
      }
      expect(line).toContain('Secret "Tower" v2.zip')
      const crumb = redactBreadcrumb({category: 'console', level: 'warning', message: line, data: {arguments: [line]}})
      expect(crumb.message).toBe('modelArchive: file (name withheld) holds no model Share opens (rvt)')
      expect(JSON.stringify(crumb)).not.toMatch(/Secret|Tower/)
    })

    it('refuses an archive it can\'t read with the reason, still as an unrecognized format', async () => {
      const alert = jest.fn()
      const zip = zipSync({'Tower.ifc': IFC})
      const truncated = upload(zip.subarray(0, zip.length - 10), 'Tower.zip')
      expect(await openUploadThroughArchive(truncated, {entry: 'picker', alert, open: jest.fn()})).toBe('refused')
      const [refusal] = alert.mock.calls[0]
      expect(refusal).toMatchObject({type: 'unrecognizedFormat', ext: 'zip', entry: 'picker'})
      expect(refusal.archive.problem).toMatch(/damaged or incomplete/)
      expect(refusal.message).toBe(refusal.archive.problem)
    })

    it('ends in a dialog even when looking inside fails for a reason that isn\'t the archive', async () => {
      // Review of Share#2010: this used to escape both seams, leaving no
      // dialog and no `onError` (so the onboarding overlay stayed up).
      const defect = new TypeError('a defect')
      mockDirectoryError = defect
      const alert = jest.fn()
      const open = jest.fn()
      const zip = zipSync({'a.ifc': IFC})
      expect(await openUploadThroughArchive(upload(zip, 'a.zip'), {entry: 'drop', alert, open})).toBe('refused')
      expect(alert).toHaveBeenCalledTimes(1)
      expect(alert.mock.calls[0][0]).toBe(defect)
      expect(open).not.toHaveBeenCalled()
    })

    it('lets the seam\'s own failures propagate', async () => {
      const open = jest.fn().mockRejectedValue(new Error('OPFS said no'))
      await expect(openUploadThroughArchive(upload(GLB, 'part.glb'), {entry: 'drop', alert: jest.fn(), open}))
        .rejects.toThrow('OPFS said no')
    })
  })

  describe('noModelInArchiveAlert', () => {
    it('is tagged by the archive\'s own extension, so a renamed one is counted as what it was called', () => {
      expect(noModelInArchiveAlert('bundle.ZIP', 'drop', ['pdf']).ext).toBe('zip')
      expect(noModelInArchiveAlert('download', 'drop', ['pdf']).ext).toBe('none')
    })
  })

  describe('unwrapIfcZip', () => {
    it('gives the IFC parser the .ifc inside, as an ArrayBuffer', async () => {
      const unwrapped = await unwrapIfcZip(zipSync({'Tower.ifc': IFC}).buffer)
      expect(unwrapped.type).toBe('ifc')
      expect(unwrapped.modelData).toBeInstanceOf(ArrayBuffer)
      expect(new TextDecoder().decode(unwrapped.modelData)).toBe(new TextDecoder().decode(IFC))
    })

    it('hands bytes that aren\'t a zip on unchanged, for conway to judge', async () => {
      const unwrapped = await unwrapIfcZip(IFC.buffer)
      expect(unwrapped).toEqual({modelData: IFC.buffer, type: 'ifc'})
    })

    it('refuses a .ifczip that doesn\'t hold exactly one IFC', async () => {
      await expect(unwrapIfcZip(zipSync({'a.ifc': IFC, 'b.ifc': IFC}).buffer)).rejects.toThrow(ZipArchiveError)
      await expect(unwrapIfcZip(zipSync({'a.glb': GLB}).buffer)).rejects.toThrow('holds a .glb model, not an IFC')
      await expect(unwrapIfcZip(zipSync({'a.pdf': PDF}).buffer)).rejects.toThrow('holds no IFC model')
    })
  })
})
