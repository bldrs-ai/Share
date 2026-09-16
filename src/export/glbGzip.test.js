// The gzip post-step, against a REAL `CompressionStream`.
//
// jsdom implements none, so Node's own is planted — the same WHATWG interface
// the browser gives, over the same zlib. Mocking it instead would leave the
// two properties the rest of the feature is built on untested: that the output
// is a gzip member the world can read, and that two calls agree byte for byte
// (`artifactSizes.js` quotes a length measured on one call and downloads the
// bytes from another).
import {
  CompressionStream as NodeCompressionStream,
  DecompressionStream as NodeDecompressionStream,
} from 'node:stream/web'
import {gunzipSync, gzipSync} from 'node:zlib'
import {gunzipBytes, gzipBytes, gzippedLength, isGunzipAvailable, isGzipAvailable} from './glbGzip'


// Over the 1 MiB write chunk, so the loop in `gzipBytes` runs more than once —
// the single-chunk path would not exercise backpressure or the chunk boundary
// the determinism claim depends on.
const MULTI_CHUNK_BYTES = 3_000_000
// Compressible without being degenerate: a repeating byte would gzip to
// nothing and prove less than a file-shaped ratio does.
const REPEAT_PERIOD = 7
// Bytes that are not a gzip member — no 0x1f 0x8b, so the decoder rejects
// them at the header rather than partway through.
const CORRUPT_BYTES = 4096
const CORRUPT_FILL = 0xab


/**
 * @param {number} length
 * @return {Uint8Array} compressible, non-degenerate bytes
 */
function pattern(length) {
  return new Uint8Array(length).map((_, i) => i % REPEAT_PERIOD)
}


describe('glbGzip', () => {
  describe('without a CompressionStream', () => {
    it('says so, which is what hides the option', () => {
      // Safari only got `CompressionStream` in 16.4, and the panel renders no
      // toggle where this is false — shipping uncompressed bytes under a
      // `.gz` name is the one outcome this option must not have (#1854).
      expect(global.CompressionStream).toBeUndefined()
      expect(isGzipAvailable()).toBe(false)
      expect(isGunzipAvailable()).toBe(false)
    })
  })

  describe('with one', () => {
    beforeEach(() => {
      global.CompressionStream = NodeCompressionStream
      global.DecompressionStream = NodeDecompressionStream
    })

    afterEach(() => {
      delete global.CompressionStream
      delete global.DecompressionStream
    })

    it('says so', () => {
      expect(isGzipAvailable()).toBe(true)
      expect(isGunzipAvailable()).toBe(true)
    })

    it('produces a gzip member anything can read', async () => {
      // The claim the `.gz` name makes. Checked by DECOMPRESSING with an
      // unrelated implementation — node's zlib, not the stream that wrote it
      // — so this fails if the output is raw deflate, a zlib wrapper, or
      // truncated at a chunk boundary, none of which "it got smaller" would
      // catch.
      const source = pattern(MULTI_CHUNK_BYTES)

      const out = await gzipBytes(source)

      expect(out.byteLength).toBeLessThan(source.byteLength)
      expect([...gunzipSync(Buffer.from(out))]).toEqual([...source])
    })

    it('gives the same bytes twice, which is what lets the panel re-gzip', async () => {
      // The invariant the size line rests on: `artifactSizes.js` measures the
      // length once and `useExport.js` re-derives the bytes at download time
      // rather than holding a third copy of the file. If those two disagreed
      // by a byte, the figure the user read would not be the file they got.
      const source = pattern(MULTI_CHUNK_BYTES)

      const first = await gzipBytes(source)
      const second = await gzipBytes(source)

      expect([...second]).toEqual([...first])
      expect(await gzippedLength(source)).toBe(first.byteLength)
    })

    it('inflates what it deflated, including across the chunk boundary', async () => {
      // `gunzipBytes` is the OPFS cache's read half (#1855); a round trip
      // through both halves is what the container's byte-identity rests on.
      const source = pattern(MULTI_CHUNK_BYTES)

      expect([...await gunzipBytes(await gzipBytes(source))]).toEqual([...source])
      // And it reads a member this module did not write, so the container is
      // not quietly depending on one implementation's framing.
      expect([...await gunzipBytes(new Uint8Array(gzipSync(Buffer.from(source))))]).toEqual([...source])
    })

    it('rejects corrupt input without leaking an unhandled rejection', async () => {
      // A truncated OPFS write reaches `gunzipBytes` as garbage, and the
      // failure has to arrive as one rejection the caller can catch. Both
      // halves of the stream reject, and whichever is not awaited becomes an
      // unhandled rejection — a console error and a Sentry event for
      // something the reader already handles by treating the artifact as a
      // miss (`glbGzip.js`, `loader/glbContainer.js`).
      const unhandled = []
      const onUnhandled = (reason) => unhandled.push(reason)
      process.on('unhandledRejection', onUnhandled)
      try {
        await expect(gunzipBytes(new Uint8Array(CORRUPT_BYTES).fill(CORRUPT_FILL))).rejects.toThrow()
        // Node reports an unhandled rejection a macrotask after the
        // microtask queue drains, so give it that turn before looking.
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(unhandled).toEqual([])
      } finally {
        process.off('unhandledRejection', onUnhandled)
      }
    })

    it('handles an empty input rather than hanging on the writer', async () => {
      // The write loop does not run at all here, so this is the case where a
      // close-before-read or a missed `writer.ready` would deadlock instead of
      // failing.
      const out = await gzipBytes(new Uint8Array(0))

      expect(out.byteLength).toBeGreaterThan(0)
      expect(gunzipSync(Buffer.from(out)).byteLength).toBe(0)
    })
  })
})
