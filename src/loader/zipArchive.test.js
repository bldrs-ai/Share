/* eslint-disable no-magic-numbers */
// Byte offsets and sizes of the zip format, each named where a reader would
// need the name; the rest are the spec's own field positions.
// The zip reader, against archives written by something other than itself:
// fflate's `zipSync` (three's vendored copy, the writer behind every zip test
// here) and, for the records fflate never writes — zip64, a lying directory —
// a byte-level builder below.
import {zipSync} from 'three/examples/jsm/libs/fflate.module.js'
import {
  MAX_ENTRY_INFLATED_BYTES,
  MAX_TOTAL_INFLATED_BYTES,
  ZipArchiveError,
  extractZipEntry,
  looksLikeZipBytes,
  readZipDirectory,
} from './zipArchive'


/**
 * UTF-8 bytes in this realm's Uint8Array. TextEncoder's come from Node's
 * realm under jest-fixed-jsdom, and fflate's `zipSync` tells a file from a
 * folder by `instanceof Uint8Array` — so it would zip them as folders.
 *
 * @param {string} text
 * @return {Uint8Array}
 */
function utf8(text) {
  return new Uint8Array(new TextEncoder().encode(text))
}


const IFC_TEXT = utf8('ISO-10303-21;\nHEADER;\nFILE_SCHEMA((\'IFC4\'));\nENDSEC;\n')
const BYTES_PER_MIB = 1024 * 1024
// Enough zeros that deflate shrinks them ~1000:1 — the shape of a bomb.
const ZEROS_MIB = 4
const ZEROS = new Uint8Array(ZEROS_MIB * BYTES_PER_MIB)


/**
 * @param {Uint8Array} bytes
 * @return {Blob}
 */
function blobOf(bytes) {
  return new Blob([bytes])
}


/**
 * A fresh budget at the real per-upload total.
 *
 * @return {{remaining: number}}
 */
function freshBudget() {
  return {remaining: MAX_TOTAL_INFLATED_BYTES}
}


// Central-directory field offsets this test patches, mirroring the reader's.
const CDH_SIZE = 24
const CDH_NAME_LENGTH = 28
const CDH_EXTRA_LENGTH = 30
const CDH_COMMENT_LENGTH = 32
const CDH_BYTES = 46
const EOCD_BYTES = 22
const EOCD_DIRECTORY_OFFSET = 16
const EOCD_ENTRY_COUNT = 10


/**
 * Overwrite one entry's declared inflated size in a finished archive's
 * central directory — the field a zip bomb lies in.
 *
 * @param {Uint8Array} zip
 * @param {string} path
 * @param {number} size
 * @return {Uint8Array} the same archive, patched
 */
function withDeclaredSize(zip, path, size) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const eocd = zip.byteLength - EOCD_BYTES
  let at = view.getUint32(eocd + EOCD_DIRECTORY_OFFSET, true)
  const count = view.getUint16(eocd + EOCD_ENTRY_COUNT, true)
  for (let i = 0; i < count; i++) {
    const nameLength = view.getUint16(at + CDH_NAME_LENGTH, true)
    const name = new TextDecoder().decode(zip.subarray(at + CDH_BYTES, at + CDH_BYTES + nameLength))
    if (name === path) {
      view.setUint32(at + CDH_SIZE, size, true)
      return zip
    }
    at += CDH_BYTES + nameLength + view.getUint16(at + CDH_EXTRA_LENGTH, true) +
      view.getUint16(at + CDH_COMMENT_LENGTH, true)
  }
  throw new Error(`no entry ${path}`)
}


/**
 * A one-entry archive written byte by byte, with every 32-bit size and
 * offset saturated and the real values in a zip64 extra field — what tools
 * write for entries past 4 GiB, and what fflate never writes.
 *
 * @param {string} path
 * @param {Uint8Array} data stored, uncompressed
 * @return {Uint8Array}
 */
function zip64StoredArchive(path, data) {
  const name = utf8(path)
  const SATURATED = 0xffffffff
  const ZIP64_EXTRA_BYTES = 28
  const local = new Uint8Array(30 + name.length + data.length)
  const lv = new DataView(local.buffer)
  lv.setUint32(0, 0x04034b50, true)
  lv.setUint16(26, name.length, true)
  local.set(name, 30)
  local.set(data, 30 + name.length)
  const central = new Uint8Array(CDH_BYTES + name.length + ZIP64_EXTRA_BYTES)
  const cv = new DataView(central.buffer)
  cv.setUint32(0, 0x02014b50, true)
  cv.setUint32(20, SATURATED, true)
  cv.setUint32(CDH_SIZE, SATURATED, true)
  cv.setUint16(CDH_NAME_LENGTH, name.length, true)
  cv.setUint16(CDH_EXTRA_LENGTH, ZIP64_EXTRA_BYTES, true)
  cv.setUint32(42, SATURATED, true)
  central.set(name, CDH_BYTES)
  const extra = CDH_BYTES + name.length
  cv.setUint16(extra, 0x0001, true)
  cv.setUint16(extra + 2, 24, true)
  cv.setBigUint64(extra + 4, BigInt(data.length), true)
  cv.setBigUint64(extra + 12, BigInt(data.length), true)
  cv.setBigUint64(extra + 20, 0n, true)
  const end = new Uint8Array(EOCD_BYTES)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, 1, true)
  ev.setUint16(EOCD_ENTRY_COUNT, 1, true)
  ev.setUint32(12, central.length, true)
  ev.setUint32(EOCD_DIRECTORY_OFFSET, local.length, true)
  const out = new Uint8Array(local.length + central.length + end.length)
  out.set(local)
  out.set(central, local.length)
  out.set(end, local.length + central.length)
  return out
}


/**
 * @param {Promise} pending
 * @return {Promise<string>} the ZipArchiveError's message
 */
async function refusal(pending) {
  const e = await pending.then(() => null, (err) => err)
  expect(e).toBeInstanceOf(ZipArchiveError)
  return e.message
}


describe('zipArchive', () => {
  describe('looksLikeZipBytes', () => {
    it('knows a local file header and an empty archive, and nothing else', () => {
      expect(looksLikeZipBytes(zipSync({'a.ifc': IFC_TEXT}))).toBe(true)
      expect(looksLikeZipBytes(zipSync({}))).toBe(true)
      expect(looksLikeZipBytes(IFC_TEXT)).toBe(false)
      expect(looksLikeZipBytes(new Uint8Array([0x1f, 0x8b, 8, 0]))).toBe(false)
      expect(looksLikeZipBytes(new Uint8Array([0x50, 0x4b]))).toBe(false)
    })
  })

  describe('readZipDirectory', () => {
    it('lists the files, with their names and extensions, leaving out folders and Finder metadata', async () => {
      const zip = zipSync({
        'export/': new Uint8Array(0),
        'export/Tower.IFC': IFC_TEXT,
        'export/Tower.txt': utf8('Revit export'),
        'README': utf8('read me'),
        '__MACOSX/export/._Tower.IFC': new Uint8Array([0, 5, 22, 7]),
        'export/._Tower.IFC': new Uint8Array([0, 5, 22, 7]),
      })
      const entries = await readZipDirectory(blobOf(zip))
      expect(entries.map(({path, name, ext}) => ({path, name, ext}))).toEqual([
        {path: 'export/Tower.IFC', name: 'Tower.IFC', ext: 'ifc'},
        {path: 'export/Tower.txt', name: 'Tower.txt', ext: 'txt'},
        {path: 'README', name: 'README', ext: ''},
      ])
      expect(entries[0].size).toBe(IFC_TEXT.length)
    })

    it('reads an empty archive as no files', async () => {
      expect(await readZipDirectory(blobOf(zipSync({})))).toEqual([])
    })

    it('refuses an archive cut short, which has no directory to read', async () => {
      const zip = zipSync({'a.ifc': IFC_TEXT})
      expect(await refusal(readZipDirectory(blobOf(zip.subarray(0, zip.length - 30)))))
        .toMatch(/damaged or incomplete/)
    })

    it('reads sizes and offsets from a zip64 extra field', async () => {
      const entries = await readZipDirectory(blobOf(zip64StoredArchive('big.stl', IFC_TEXT)))
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({name: 'big.stl', size: IFC_TEXT.length, compressedSize: IFC_TEXT.length})
      expect(entries[0].localHeaderOffset).toBe(0)
      const bytes = await extractZipEntry(blobOf(zip64StoredArchive('big.stl', IFC_TEXT)), entries[0], freshBudget())
      expect(new TextDecoder().decode(bytes)).toBe(new TextDecoder().decode(IFC_TEXT))
    })
  })

  describe('extractZipEntry', () => {
    it('inflates a deflated entry and copies a stored one, charging the budget what came out', async () => {
      const zip = zipSync({'a.ifc': [IFC_TEXT, {level: 6}], 'b.ifc': [IFC_TEXT, {level: 0}]})
      const blob = blobOf(zip)
      const [deflated, stored] = await readZipDirectory(blob)
      expect(deflated.method).toBe(8)
      expect(stored.method).toBe(0)
      const budget = freshBudget()
      for (const entry of [deflated, stored]) {
        expect([...await extractZipEntry(blob, entry, budget)]).toEqual([...IFC_TEXT])
      }
      expect(budget.remaining).toBe(MAX_TOTAL_INFLATED_BYTES - (2 * IFC_TEXT.length))
    })

    it('inflates a large entry fed in many pushes', async () => {
      const blob = blobOf(zipSync({'zeros.stl': ZEROS}))
      const [entry] = await readZipDirectory(blob)
      // Smaller than one push's input: the many-push path is what's exercised.
      expect(entry.compressedSize).toBeLessThan(ZEROS.length / 100)
      const bytes = await extractZipEntry(blob, entry, freshBudget())
      expect(bytes.length).toBe(ZEROS.length)
      expect(bytes.every((b) => b === 0)).toBe(true)
    })

    it('refuses an entry that declares more than the per-entry ceiling, before reading it', async () => {
      expect(MAX_ENTRY_INFLATED_BYTES).toBe(512 * BYTES_PER_MIB)
      const zip = withDeclaredSize(zipSync({'big.ifc': IFC_TEXT}), 'big.ifc', MAX_ENTRY_INFLATED_BYTES + 1)
      const blob = blobOf(zip)
      const [entry] = await readZipDirectory(blob)
      const slice = jest.spyOn(blob, 'slice')
      expect(await refusal(extractZipEntry(blob, entry, freshBudget()))).toBe(
        'The model in this archive unpacks to more than 512 MiB, which is larger than any model Share can open.')
      expect(slice).not.toHaveBeenCalled()
    })

    it('counts what the inflate produces: an entry that lies low about its size is refused', async () => {
      // The bomb's shape: 4 MiB of zeros in ~4 KiB, declaring 1 KiB. Trusting
      // the declaration would allocate 1 KiB and inflate 4 MiB into it.
      const zip = withDeclaredSize(zipSync({'bomb.stl': ZEROS}), 'bomb.stl', 1024)
      const blob = blobOf(zip)
      const [entry] = await readZipDirectory(blob)
      expect(entry.size).toBe(1024)
      const budget = freshBudget()
      expect(await refusal(extractZipEntry(blob, entry, budget))).toMatch(/damaged or incomplete/)
      expect(budget.remaining).toBe(MAX_TOTAL_INFLATED_BYTES)
    })

    it('refuses an entry that inflates to less than it declared', async () => {
      const zip = withDeclaredSize(zipSync({'short.ifc': IFC_TEXT}), 'short.ifc', IFC_TEXT.length + 1)
      const blob = blobOf(zip)
      const [entry] = await readZipDirectory(blob)
      expect(await refusal(extractZipEntry(blob, entry, freshBudget()))).toMatch(/damaged or incomplete/)
    })

    it('holds every entry of one upload to what is left of its total', async () => {
      const blob = blobOf(zipSync({'a.stl': ZEROS, 'b.stl': ZEROS}))
      const [a, b] = await readZipDirectory(blob)
      // Room for one entry and a half: each is under the per-entry ceiling,
      // and the second still doesn't fit.
      const budget = {remaining: ZEROS.length * 1.5}
      expect((await extractZipEntry(blob, a, budget)).length).toBe(ZEROS.length)
      expect(budget.remaining).toBe(ZEROS.length / 2)
      expect(await refusal(extractZipEntry(blob, b, budget))).toMatch(/unpacks to more than/)
    })

    it('says why it can\'t open an encrypted entry or an unsupported method', async () => {
      const blob = blobOf(zipSync({'a.ifc': IFC_TEXT}))
      const [entry] = await readZipDirectory(blob)
      expect(await refusal(extractZipEntry(blob, {...entry, flags: 1}, freshBudget()))).toMatch(/password-protected/)
      expect(await refusal(extractZipEntry(blob, {...entry, method: 12}, freshBudget()))).toMatch(/bzip2/)
      expect(await refusal(extractZipEntry(blob, {...entry, method: 77}, freshBudget()))).toMatch(/method 77/)
    })

    it('refuses a corrupt deflate stream as damaged', async () => {
      // A valid archive around bytes that are not deflate: a reserved block type.
      const garbage = new Uint8Array([0xff, 0xff, 0xff, 0xff])
      const zip = zipSync({'a.ifc': [IFC_TEXT, {level: 0}]})
      const blob = blobOf(zip)
      const [entry] = await readZipDirectory(blob)
      const asDeflated = {...entry, method: 8, compressedSize: garbage.length}
      const patched = new Uint8Array(zip)
      patched.set(garbage, 30 + 'a.ifc'.length)
      expect(await refusal(extractZipEntry(blobOf(patched), asDeflated, freshBudget())))
        .toMatch(/damaged or incomplete/)
    })
  })
})
