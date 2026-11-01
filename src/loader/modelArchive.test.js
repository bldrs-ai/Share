/* eslint-disable no-magic-numbers */
// Which entry of an archive is the model, and what each seam is told — over
// archives written by fflate's `zipSync`, not by the code under test.
import {zipSync} from 'three/examples/jsm/libs/fflate.module.js'
import {
  ARCHIVE_ENTRY_CHOICE,
  noModelInArchiveAlert,
  openUploadThroughArchive,
  resolveArchiveUpload,
  unwrapIfcZip,
} from './modelArchive'
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
      expect(summary(await resolveArchiveUpload(upload(zipSync({'a.ifc': new Uint8Array(0)}), 'x.zip'))))
        .toEqual({kind: 'none', exts: ['ifc']})
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
        'This glTF keeps its data in separate files (a .bin, textures), which Share can\'t open from inside ' +
        'an archive. Export the model as a single .glb, then open that.')
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
