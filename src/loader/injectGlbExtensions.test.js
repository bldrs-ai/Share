/* eslint-disable no-magic-numbers */
import * as pako from 'pako'
import {
  injectGlbExtensions,
  parseGlb,
  serializeGlb,
} from './injectGlbExtensions'


/**
 * Build a minimal valid GLB (header + JSON chunk + BIN chunk). The JSON
 * declares one buffer of `binBytes` length; the BIN chunk contains
 * `binBytes` zero-bytes so the bufferView byteLength check downstream
 * stays consistent with what GLTFExporter produces.
 *
 * @param {object} [opts]
 * @param {number} [opts.binBytes] binary chunk data length (will be padded
 *   internally to a 4-byte boundary).
 * @param {Array} [opts.bufferViews] bufferViews JSON (default: one entry
 *   covering the whole binary).
 * @return {Uint8Array}
 */
function makeMinimalGlb({binBytes = 16, bufferViews} = {}) {
  const json = {
    asset: {version: '2.0'},
    buffers: [{byteLength: binBytes}],
    bufferViews: bufferViews ?? [{buffer: 0, byteOffset: 0, byteLength: binBytes}],
  }
  const bin = new Uint8Array(binBytes)
  return serializeGlb(json, bin)
}


describe('loader/injectGlbExtensions', () => {
  describe('parseGlb / serializeGlb roundtrip', () => {
    it('round-trips a minimal GLB with JSON + BIN chunks', () => {
      const json = {asset: {version: '2.0'}, buffers: [{byteLength: 8}]}
      const bin = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
      const glb = serializeGlb(json, bin)
      const parsed = parseGlb(glb)
      expect(parsed.json).toEqual(json)
      expect(Array.from(parsed.bin)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    })

    it('round-trips a JSON-only GLB (no BIN chunk)', () => {
      const json = {asset: {version: '2.0'}}
      const glb = serializeGlb(json, null)
      const parsed = parseGlb(glb)
      expect(parsed.json).toEqual(json)
      expect(parsed.bin).toBeNull()
    })

    it('strips trailing chunk padding so JSON parses cleanly even with unaligned data length', () => {
      // 5-byte JSON ("asset" only would be longer; use a 1-key obj).
      // serializeGlb pads it to 8 bytes with spaces; parseGlb must
      // strip the padding before JSON.parse.
      const json = {x: 1}
      const glb = serializeGlb(json, null)
      const parsed = parseGlb(glb)
      expect(parsed.json).toEqual({x: 1})
    })

    it('rejects a non-GLB blob (bad magic)', () => {
      const bad = new Uint8Array(16)
      bad[0] = 0x42 // "B" — not "g" of glTF
      expect(() => parseGlb(bad)).toThrow(/bad magic/)
    })

    it('rejects too-short input', () => {
      expect(() => parseGlb(new Uint8Array(4))).toThrow(/too short/)
    })

    it('rejects non-JSON first chunk', () => {
      // Hand-build a GLB whose first chunk is BIN instead of JSON.
      const buf = new Uint8Array(12 + 8)
      const dv = new DataView(buf.buffer)
      dv.setUint32(0, 0x46546C67, true) // magic "glTF"
      dv.setUint32(4, 2, true) // version
      dv.setUint32(8, buf.byteLength, true) // total length
      dv.setUint32(12, 0, true) // chunk len
      dv.setUint32(16, 0x004E4942, true) // chunk type "BIN\0"
      expect(() => parseGlb(buf)).toThrow(/not JSON/)
    })
  })

  describe('injectGlbExtensions — no-op cases', () => {
    it('returns the input bytes unchanged when extensions list is empty', () => {
      const glb = makeMinimalGlb()
      const {bytes, stats} = injectGlbExtensions(glb, [])
      expect(bytes).toBe(glb)
      expect(stats).toEqual({
        addedExtensions: 0, addedBinBytes: 0, addedSceneExtras: 0, skippedNames: [],
      })
    })

    it('returns the input bytes unchanged when all entries have null data', () => {
      const glb = makeMinimalGlb()
      const {bytes, stats} = injectGlbExtensions(glb, [
        {name: 'BLDRS_x', data: null},
        {name: 'BLDRS_y', data: undefined},
      ])
      expect(bytes).toBe(glb)
      expect(stats.addedExtensions).toBe(0)
    })

    it('returns the input bytes unchanged when extensions is null/undefined', () => {
      const glb = makeMinimalGlb()
      expect(injectGlbExtensions(glb, null).bytes).toBe(glb)
      expect(injectGlbExtensions(glb, undefined).bytes).toBe(glb)
    })
  })

  describe('injectGlbExtensions — single extension', () => {
    it('appends a bufferView and extension entry with compressed payload', () => {
      const glb = makeMinimalGlb({binBytes: 16})
      const data = {hello: 'world', n: 42}
      const {bytes} = injectGlbExtensions(glb, [
        {name: 'BLDRS_test', data, compress: true},
      ])

      const parsed = parseGlb(bytes)
      expect(parsed.json.extensionsUsed).toContain('BLDRS_test')
      expect(parsed.json.extensions.BLDRS_test).toEqual({compressed: true, bufferView: 1})

      // The new bufferView is appended after the existing one (index 1).
      expect(parsed.json.bufferViews).toHaveLength(2)
      const newBv = parsed.json.bufferViews[1]
      expect(newBv.buffer).toBe(0)
      // byteOffset should be 4-aligned and >= original binBytes.
      expect(newBv.byteOffset % 4).toBe(0)
      expect(newBv.byteOffset).toBeGreaterThanOrEqual(16)

      // Decompress the payload at the bufferView's offset to verify
      // the data made the round trip.
      const payload = parsed.bin.subarray(
        newBv.byteOffset, newBv.byteOffset + newBv.byteLength)
      const json = pako.ungzip(payload, {to: 'string'})
      expect(JSON.parse(json)).toEqual(data)
    })

    it('updates buffers[0].byteLength to cover the appended payload', () => {
      const glb = makeMinimalGlb({binBytes: 8})
      const {bytes} = injectGlbExtensions(glb, [
        {name: 'BLDRS_test', data: {a: 1}, compress: true},
      ])
      const parsed = parseGlb(bytes)
      const expectedMin = parsed.json.bufferViews[1].byteOffset +
                          parsed.json.bufferViews[1].byteLength
      expect(parsed.json.buffers[0].byteLength).toBe(expectedMin)
      expect(parsed.bin.byteLength).toBe(expectedMin)
    })

    it('supports an uncompressed payload', () => {
      const glb = makeMinimalGlb({binBytes: 4})
      const data = {raw: true}
      const {bytes} = injectGlbExtensions(glb, [
        {name: 'BLDRS_test', data, compress: false},
      ])
      const parsed = parseGlb(bytes)
      expect(parsed.json.extensions.BLDRS_test).toEqual({compressed: false, bufferView: 1})
      const bv = parsed.json.bufferViews[1]
      const payload = parsed.bin.subarray(bv.byteOffset, bv.byteOffset + bv.byteLength)
      const text = new TextDecoder('utf-8').decode(payload)
      expect(JSON.parse(text)).toEqual(data)
    })

    it('returns stats describing what changed', () => {
      const glb = makeMinimalGlb({binBytes: 8})
      const {stats} = injectGlbExtensions(glb, [
        {name: 'BLDRS_test', data: {x: 1}},
      ])
      expect(stats.addedExtensions).toBe(1)
      expect(stats.addedBinBytes).toBeGreaterThan(0)
      expect(stats.skippedNames).toEqual([])
    })
  })

  describe('injectGlbExtensions — multiple extensions', () => {
    it('lays out each new bufferView at a 4-aligned offset, in order', () => {
      const glb = makeMinimalGlb({binBytes: 4})
      const {bytes} = injectGlbExtensions(glb, [
        {name: 'BLDRS_a', data: {a: 1}},
        {name: 'BLDRS_b', data: {b: 2}},
        {name: 'BLDRS_c', data: {c: 3}},
      ])
      const parsed = parseGlb(bytes)
      expect(parsed.json.extensionsUsed).toEqual(
        expect.arrayContaining(['BLDRS_a', 'BLDRS_b', 'BLDRS_c']))
      const newBvs = parsed.json.bufferViews.slice(1)
      expect(newBvs).toHaveLength(3)
      for (let i = 0; i < newBvs.length; i++) {
        expect(newBvs[i].byteOffset % 4).toBe(0)
        if (i > 0) {
          expect(newBvs[i].byteOffset).toBeGreaterThan(newBvs[i - 1].byteOffset)
        }
      }
    })

    it('does not duplicate names already in extensionsUsed', () => {
      // Note this is a different shape from the "collision" case below:
      // the name is in extensionsUsed but NOT in extensions{}, so the
      // injection still runs and dedupes the extensionsUsed entry.
      const json = {
        asset: {version: '2.0'},
        buffers: [{byteLength: 4}],
        bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 4}],
        extensionsUsed: ['BLDRS_test'],
      }
      const glb = serializeGlb(json, new Uint8Array(4))
      const {bytes} = injectGlbExtensions(glb, [
        {name: 'BLDRS_test', data: {x: 1}},
      ])
      const parsed = parseGlb(bytes)
      expect(parsed.json.extensionsUsed.filter((n) => n === 'BLDRS_test')).toHaveLength(1)
    })
  })

  describe('injectGlbExtensions — collision handling', () => {
    it('skips an extension whose name is already in json.extensions, reports via stats', () => {
      // Building a GLB that already carries an `extensions.BLDRS_test`
      // entry. Re-injecting under the same name should NOT overwrite —
      // that would silently orphan the existing bufferView, leaving a
      // dead-data corruption path through cache round-trips. Instead we
      // skip and surface the name via stats.skippedNames so the caller
      // can log / metric.
      const json = {
        asset: {version: '2.0'},
        buffers: [{byteLength: 4}],
        bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 4}],
        extensionsUsed: ['BLDRS_test'],
        extensions: {BLDRS_test: {compressed: true, bufferView: 0}},
      }
      const glb = serializeGlb(json, new Uint8Array(4))
      const {bytes, stats} = injectGlbExtensions(glb, [
        {name: 'BLDRS_test', data: {x: 999}},
      ])
      expect(stats.addedExtensions).toBe(0)
      expect(stats.skippedNames).toEqual(['BLDRS_test'])
      // Pass-through: existing entry untouched.
      expect(bytes).toBe(glb)
      const parsed = parseGlb(bytes)
      expect(parsed.json.extensions.BLDRS_test).toEqual({compressed: true, bufferView: 0})
    })

    it('still injects siblings when one entry in the batch collides', () => {
      const json = {
        asset: {version: '2.0'},
        buffers: [{byteLength: 4}],
        bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 4}],
        extensionsUsed: ['BLDRS_a'],
        extensions: {BLDRS_a: {compressed: true, bufferView: 0}},
      }
      const glb = serializeGlb(json, new Uint8Array(4))
      const {bytes, stats} = injectGlbExtensions(glb, [
        {name: 'BLDRS_a', data: {a: 1}}, // collides — skipped
        {name: 'BLDRS_b', data: {b: 2}}, // fresh — injected
      ])
      expect(stats.addedExtensions).toBe(1)
      expect(stats.skippedNames).toEqual(['BLDRS_a'])
      const parsed = parseGlb(bytes)
      expect(parsed.json.extensions.BLDRS_a).toEqual({compressed: true, bufferView: 0})
      expect(parsed.json.extensions.BLDRS_b).toBeDefined()
    })
  })

  describe('injectGlbExtensions — synthesises missing structures', () => {
    it('adds a BIN chunk if the source GLB has none', () => {
      const json = {asset: {version: '2.0'}}
      const glb = serializeGlb(json, null)
      const {bytes} = injectGlbExtensions(glb, [
        {name: 'BLDRS_test', data: {x: 1}},
      ])
      const parsed = parseGlb(bytes)
      expect(parsed.bin).not.toBeNull()
      expect(parsed.bin.byteLength).toBeGreaterThan(0)
      expect(parsed.json.buffers).toBeDefined()
      expect(parsed.json.buffers[0].byteLength).toBe(parsed.bin.byteLength)
      expect(parsed.json.bufferViews).toHaveLength(1)
      expect(parsed.json.extensions.BLDRS_test).toBeDefined()
    })
  })


  describe('injectGlbExtensions — sceneExtras', () => {
    /**
     * Build a minimal GLB that includes a scenes[] array so the
     * scene-extras path has somewhere to attach. The default
     * `makeMinimalGlb` omits `scenes`, which lets us test the
     * degenerate "no scenes" branch separately.
     *
     * @return {Uint8Array}
     */
    function makeGlbWithScene() {
      const json = {
        asset: {version: '2.0'},
        scene: 0,
        scenes: [{nodes: []}],
        buffers: [{byteLength: 0}],
      }
      return serializeGlb(json, null)
    }

    it('merges scene extras into json.scenes[json.scene].extras', () => {
      const glb = makeGlbWithScene()
      const {bytes, stats} = injectGlbExtensions(glb, [], {bldrsTitle: 'Momentum'})
      const parsed = parseGlb(bytes)
      expect(parsed.json.scenes[0].extras.bldrsTitle).toBe('Momentum')
      expect(stats.addedSceneExtras).toBe(1)
      expect(stats.addedExtensions).toBe(0)
    })

    it('targets json.scene index when it differs from 0', () => {
      const json = {
        asset: {version: '2.0'},
        scene: 1,
        scenes: [{nodes: []}, {nodes: []}],
        buffers: [{byteLength: 0}],
      }
      const glb = serializeGlb(json, null)
      const {bytes} = injectGlbExtensions(glb, [], {bldrsTitle: 'Project'})
      const parsed = parseGlb(bytes)
      expect(parsed.json.scenes[1].extras.bldrsTitle).toBe('Project')
      expect(parsed.json.scenes[0].extras).toBeUndefined()
    })

    it('preserves pre-existing extras keys and overwrites colliding ones', () => {
      const json = {
        asset: {version: '2.0'},
        scene: 0,
        scenes: [{nodes: [], extras: {keepMe: 'untouched', bldrsTitle: 'old'}}],
        buffers: [{byteLength: 0}],
      }
      const glb = serializeGlb(json, null)
      const {bytes} = injectGlbExtensions(glb, [], {bldrsTitle: 'new'})
      const parsed = parseGlb(bytes)
      expect(parsed.json.scenes[0].extras).toEqual({
        keepMe: 'untouched',
        bldrsTitle: 'new',
      })
    })

    it('skips entries with null / undefined values (per-key opt-out)', () => {
      const glb = makeGlbWithScene()
      const {bytes, stats} = injectGlbExtensions(glb, [], {
        bldrsTitle: 'kept',
        nullKey: null,
        undefKey: undefined,
      })
      const parsed = parseGlb(bytes)
      expect(parsed.json.scenes[0].extras).toEqual({bldrsTitle: 'kept'})
      expect(stats.addedSceneExtras).toBe(1)
    })

    it('returns input unchanged when both extensions and sceneExtras are empty', () => {
      const glb = makeGlbWithScene()
      const {bytes, stats} = injectGlbExtensions(glb, [], {})
      expect(bytes).toBe(glb)
      expect(stats.addedSceneExtras).toBe(0)
    })

    it('returns input unchanged when sceneExtras has only nullish values', () => {
      const glb = makeGlbWithScene()
      const {bytes, stats} = injectGlbExtensions(glb, [], {a: null, b: undefined})
      expect(bytes).toBe(glb)
      expect(stats.addedSceneExtras).toBe(0)
    })

    it('runs in the same parse/serialize pass as a BLDRS_* extension', () => {
      // Consolidated pipeline check: one inject call adds both a
      // top-level BLDRS extension AND scene-level extras with no extra
      // GLB parse cycle. Stats report both deltas.
      const glb = makeGlbWithScene()
      const {bytes, stats} = injectGlbExtensions(
        glb,
        [{name: 'BLDRS_test', data: {payload: 'hi'}, compress: true}],
        {bldrsTitle: 'Combined'},
      )
      const parsed = parseGlb(bytes)
      expect(parsed.json.extensions.BLDRS_test).toBeDefined()
      expect(parsed.json.scenes[0].extras.bldrsTitle).toBe('Combined')
      expect(stats.addedExtensions).toBe(1)
      expect(stats.addedSceneExtras).toBe(1)
      expect(stats.addedBinBytes).toBeGreaterThan(0)
    })

    it('defaults to scene index 0 when json.scene is absent', () => {
      // Spec: `json.scene` is the default-scene index but is optional.
      // Convention is to use scene 0 when omitted; the helper mirrors
      // that so GLTFExporter output (which sometimes omits `scene`)
      // still gets stamped.
      const json = {
        asset: {version: '2.0'},
        scenes: [{nodes: []}],
        buffers: [{byteLength: 0}],
      }
      const glb = serializeGlb(json, null)
      const {bytes} = injectGlbExtensions(glb, [], {bldrsTitle: 'Defaulted'})
      const parsed = parseGlb(bytes)
      expect(parsed.json.scenes[0].extras.bldrsTitle).toBe('Defaulted')
    })

    it('no-ops the scene-extras path on a GLB with no scenes array', () => {
      // Spec-legal but degenerate: no scenes[] means nowhere to attach
      // scene-level metadata. Top-level extensions still apply; the
      // scene-extras path silently no-ops.
      const json = {asset: {version: '2.0'}, buffers: [{byteLength: 0}]}
      const glb = serializeGlb(json, null)
      const {bytes, stats} = injectGlbExtensions(
        glb,
        [{name: 'BLDRS_test', data: {x: 1}, compress: true}],
        {bldrsTitle: 'ignored'},
      )
      const parsed = parseGlb(bytes)
      expect(parsed.json.extensions.BLDRS_test).toBeDefined()
      expect(parsed.json.scenes).toBeUndefined()
      expect(stats.addedExtensions).toBe(1)
      expect(stats.addedSceneExtras).toBe(0)
    })
  })
})
