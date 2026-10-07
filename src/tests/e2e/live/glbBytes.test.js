import {containerHeader, glbFramingProblems, glbJsonText, isGzip} from './glbBytes'


/* eslint-disable no-magic-numbers */
/**
 * A GLB assembled byte by byte, so each check is against lengths this test
 * chose rather than the checker's own arithmetic.
 *
 * @param {object} json the JSON chunk
 * @param {number} binBytes BIN chunk payload length (0 for none)
 * @return {Uint8Array}
 */
function makeGlb(json, binBytes = 8) {
  let text = new TextEncoder().encode(JSON.stringify(json))
  const pad = (4 - (text.length % 4)) % 4
  text = Uint8Array.from([...text, ...new Array(pad).fill(0x20)])
  const total = 12 + 8 + text.length + (binBytes > 0 ? 8 + binBytes : 0)
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  out.set(new TextEncoder().encode('glTF'), 0)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, text.length, true)
  view.setUint32(16, 0x4E4F534A, true)
  out.set(text, 20)
  if (binBytes > 0) {
    const at = 20 + text.length
    view.setUint32(at, binBytes, true)
    view.setUint32(at + 4, 0x004E4942, true)
  }
  return out
}


describe('live/glbBytes', () => {
  describe('glbFramingProblems', () => {
    const glb = makeGlb({asset: {version: '2.0'}, extensionsUsed: ['BLDRS_spatial_tree']})

    it('passes a well-framed GLB', () => {
      expect(glbFramingProblems(glb)).toEqual([])
    })

    it('fails the Bldrs container that a broken strip would hand over', () => {
      const container = glb.slice()
      container.set(new TextEncoder().encode('BLDR'), 0)
      expect(glbFramingProblems(container)).toEqual(['magic is "BLDR", not "glTF"'])
    })

    it('fails a truncated download that still starts with glTF', () => {
      const truncated = glb.subarray(0, glb.length - 4)
      expect(glbFramingProblems(truncated)).toEqual([
        `header says ${glb.length} bytes, file is ${glb.length - 4}`,
        'chunk 1 runs past the end',
      ])
    })

    it('fails a wrong version and a JSON chunk of the wrong type', () => {
      const bad = glb.slice()
      new DataView(bad.buffer).setUint32(4, 1, true)
      new DataView(bad.buffer).setUint32(16, 0x004E4942, true)
      expect(glbFramingProblems(bad)).toEqual(['version is 1, not 2', 'first chunk is not JSON'])
    })

    it('fails something too short to be a GLB at all', () => {
      expect(glbFramingProblems(new Uint8Array(10))).toEqual(['10 bytes is too short for a GLB'])
    })
  })

  it('reads the JSON chunk as text, padding trimmed', () => {
    const glb = makeGlb({asset: {version: '2.0'}, extensionsUsed: ['BLDRS_spatial_tree']})
    expect(glbJsonText(glb)).toBe('{"asset":{"version":"2.0"},"extensionsUsed":["BLDRS_spatial_tree"]}')
    expect(glbJsonText(makeGlb({asset: {version: '2.0'}}))).not.toContain('BLDRS_')
  })

  it('recognises a gzip stream', () => {
    expect(isGzip(Uint8Array.from([0x1F, 0x8B, 8, 0]))).toBe(true)
    expect(isGzip(makeGlb({asset: {}}))).toBe(false)
  })

  describe('containerHeader', () => {
    const header = (version, codecByte) => {
      const head = new Uint8Array(16)
      head.set(new TextEncoder().encode('BLDR'), 0)
      new DataView(head.buffer).setUint32(4, version, true)
      head[13] = codecByte
      return head
    }

    it('tells a gzipped v3 container from the v2 fallback', () => {
      expect(containerHeader(header(3, 1))).toEqual({version: 3, codec: 'gzip'})
      expect(containerHeader(header(3, 0))).toEqual({version: 3, codec: 'none'})
      expect(containerHeader(header(2, 0))).toEqual({version: 2, codec: null})
    })

    it('says null for anything that is not a container', () => {
      expect(containerHeader(makeGlb({asset: {}}).subarray(0, 16))).toBeNull()
      expect(containerHeader(header(3, 1).subarray(0, 8))).toBeNull()
    })
  })
})
