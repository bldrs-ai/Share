// Gzipping the export on its way out — the lossless win that beats the whole
// quality ladder, because the container and not the geometry is where a real
// model's bytes are.
//
// The measurement that produced this (#1854). On Snowdon — Autodesk's large
// IFC demo, 83.2 MB `.ifc` → 63.7 MB uncompressed GLB — the entire five-rung
// Draco ladder was worth −12.4%, and bzip2 of the resulting 16.7 MB file was
// 2.8 MB: **6×**. Draco output is entropy-coded and should be
// near-incompressible, so a 6× whole-file ratio means almost none of that
// file IS Draco output. Solving the two-term model gives ≈1.3 MB of
// compressed geometry against ≈15.4 MB of container — the glTF JSON node
// graph, which no codec touches because it is not in BIN, and the raw float32
// instance transforms (40 B each) that `EXT_mesh_gpu_instancing` puts
// permanently out of Draco's reach. `exportQuality.js`'s module doc has the
// arithmetic; the consequence is here.
//
// Reproduced through the pinned encoders on the fixtures this repo has, raw
// against gzipped bytes:
//
//   Momentum.ifc → GLB, 1,959,196 B         none 1.81×  meshopt 1.56×  draco 1.15×
//   public/index.ifc → GLB, 6,800 B         none 5.11×  meshopt 2.26×  draco 1.47×
//   instance-heavy synthetic, 622,480 B     none 3.16×  meshopt 1.14×  draco 3.08×
//
// The third row is the shape Share's batched-native writer actually produces,
// and it is the one that matters: Draco leaves the instance transforms as raw
// floats (3.08× compressible) while Meshopt compresses them into something
// gzip cannot touch (1.14×). **So gzip changes which codec wins there** —
// Meshopt 198,536 B beats Draco 527,316 B raw, and Draco 171,452 B beats
// Meshopt 173,721 B gzipped — which is why the background sweep measures
// post-compression bytes when this is on rather than ranking on the raw ones
// (`codecSizes.js`, `artifactSizes.js`).
//
// `CompressionStream` rather than a dependency: it is browser-native, it is
// streaming, and it is ~35 ms/MB measured against Draco's ~135 — so the
// cheapest thing in the panel is also the biggest win in it.
//
// Two properties the rest of the feature leans on:
//
//   - **Deterministic.** The same bytes through `gzipBytes` twice give the
//     same bytes out. That is what lets the panel cache the gzipped LENGTH
//     and re-gzip at download time instead of holding a third copy of the
//     file in memory — the size the user read and the file they get are the
//     same bytes by construction. Note how weak the property needed is:
//     both calls are THIS function, in one page, on one implementation, with
//     the same chunking, so nothing here depends on two browsers' deflate
//     agreeing. `exportGlb.spec.ts` asserts the end of it — displayed figure
//     against saved byte length — in a real browser anyway.
//   - **Not available everywhere.** Safari added `CompressionStream` in 16.4.
//     Where it is missing the option is not rendered at all
//     (`Open/ExportSection.jsx`) — shipping uncompressed bytes under a `.gz`
//     name would be worse than not offering it.
//
// What is NOT here is the `.glb.gz` name and the `application/gzip` type.
// Both belong to the file the pro module hands over, and that module may not
// import from the host bundle at all (`export/pro/glbExport.js`), so putting
// the canonical copy here would leave a second one over there anyway — with
// nothing to keep the two in step and a host-side export nobody calls.
//
// Design: design/new/glb-export-premium.md §4.3.

/**
 * Whether this browser can gzip at all.
 *
 * Read at render time rather than cached in a module constant: jsdom does not
 * implement `CompressionStream`, so the panel's own suite plants one, and a
 * constant captured at import would have frozen the answer before it did.
 *
 * @return {boolean}
 */
export function isGzipAvailable() {
  return typeof CompressionStream === 'function'
}


// Written a megabyte at a time rather than in one call. The deflate runs per
// chunk, so a 60 MB artifact hands the event loop back ~60 times instead of
// blocking it once — which is the whole reason gzip does not move the codec
// sweep's 50 MB auto-measure threshold, a constant that exists to bound
// UNINTERRUPTIBLE work (`codecSizes.js#AUTO_MEASURE_MAX_BYTES`). A megabyte
// is ~35 ms, small enough to keep the dialog's Stop button live and large
// enough that the per-chunk overhead is noise.
const BYTES_PER_KB = 1024
const GZIP_CHUNK_BYTES = BYTES_PER_KB * BYTES_PER_KB


/**
 * Gzip one export.
 *
 * The read is started BEFORE the first write: `CompressionStream` applies
 * backpressure through `writer.ready`, so a writer nobody is draining stalls
 * on a file bigger than the internal queue.
 *
 * @param {Uint8Array} bytes
 * @return {Promise<Uint8Array>} the gzip member
 */
export async function gzipBytes(bytes) {
  const stream = new CompressionStream('gzip')
  const writer = stream.writable.getWriter()
  const read = new Response(stream.readable).arrayBuffer()
  for (let offset = 0; offset < bytes.byteLength; offset += GZIP_CHUNK_BYTES) {
    await writer.ready
    await writer.write(bytes.subarray(offset, offset + GZIP_CHUNK_BYTES))
  }
  await writer.close()
  return new Uint8Array(await read)
}


/**
 * Whether this browser can UNgzip.
 *
 * Separate from `isGzipAvailable` because the two are asked in different
 * places for different reasons — the export panel asks whether to offer the
 * option at all, the OPFS cache reader asks whether an artifact it already
 * holds is readable — even though every engine that shipped one shipped both.
 *
 * @return {boolean}
 */
export function isGunzipAvailable() {
  return typeof DecompressionStream === 'function'
}


/**
 * Inflate one gzip member.
 *
 * The mirror of `gzipBytes`, and written the same way for the same reason:
 * the read is started BEFORE the first write, because `DecompressionStream`
 * applies backpressure through `writer.ready` and a writer nobody drains
 * stalls on anything larger than the internal queue. The chunking is on the
 * INPUT, so a 21 MB compressed member hands the event loop back ~21 times
 * rather than blocking it once — which matters here more than on the export
 * side, since the OPFS cache reader runs on the load's critical path
 * (`loader/glbContainer.js`).
 *
 * @param {Uint8Array} bytes a gzip member, as produced by `gzipBytes`
 * @return {Promise<Uint8Array>} the inflated bytes
 */
export async function gunzipBytes(bytes) {
  const stream = new DecompressionStream('gzip')
  const writer = stream.writable.getWriter()
  const read = new Response(stream.readable).arrayBuffer()
  try {
    for (let offset = 0; offset < bytes.byteLength; offset += GZIP_CHUNK_BYTES) {
      await writer.ready
      await writer.write(bytes.subarray(offset, offset + GZIP_CHUNK_BYTES))
    }
    await writer.close()
  } catch (writeError) {
    // Corrupt input rejects BOTH halves of the stream — the write that fed
    // it and the read that was draining it — and the one nobody awaits
    // becomes an unhandled rejection: a console error and a Sentry event
    // for a failure the caller is already handling by treating the artifact
    // as a cache miss. So drain `read`, and report the decoder's own error
    // in preference to the writable side's relay of it. `gzipBytes` has the
    // same shape and no guard because a deflate has no invalid input to
    // reject; an inflate meets one whenever an OPFS write was truncated.
    const readError = await read.then(() => null, (e) => e)
    throw readError ?? writeError
  }
  return new Uint8Array(await read)
}


/**
 * How much one export weighs gzipped, without keeping the gzipped bytes.
 *
 * The panel needs the LENGTH for every codec at every rung and the BYTES only
 * for the one file the user finally downloads, so measuring and discarding is
 * the whole memory argument for re-gzipping at download time rather than
 * caching a third copy per cell (`artifactSizes.js`).
 *
 * @param {Uint8Array} bytes
 * @return {Promise<number>}
 */
export async function gzippedLength(bytes) {
  return (await gzipBytes(bytes)).byteLength
}
