// Measuring every codec's real output size in the background, so the user can
// SEE which one wins on their model instead of clicking through all three and
// remembering.
//
// Why it is worth the CPU: which codec wins swings enormously with model
// shape, and it swings the opposite way from most people's intuition.
// Measured (#1850):
//
//   Momentum.ifc → GLB (1.96 MB, 43 prims)   Draco 250,184 B  Meshopt 1,347,740 B
//   instance-heavy synthetic (622,480 B)     Draco   −17.3%   Meshopt    −68.0%
//
// Draco encodes mesh primitives only and cannot reach `EXT_mesh_gpu_instancing`
// accessors at all — and instance-heavy is exactly what Share's batched-native
// writer produces. So a user picking on reputation picks wrong about half the
// time, and the panel already knew the answer.
//
// **Gzip moves the answer again** (#1854), which is why `isGzipped` is a real
// axis here and not a display detail. Measured on that same instance-heavy
// synthetic: Meshopt 198,536 B against Draco 527,316 B raw — Meshopt wins by
// 2.7× — but gzipped it is Draco 171,452 B against Meshopt 173,721 B, and
// Draco wins. Draco leaves the instance transforms as raw float32 (the whole
// file gzips 3.08×) while Meshopt compresses them into something gzip cannot
// touch (1.14×). Ranking a gzipped download on its raw byte counts would
// therefore recommend the wrong codec on exactly the artifact shape Share
// writes, so the sweep measures what the user receives.
//
// The interesting half of this module is what it refuses to do:
//
//   - **At most two codecs' output resident: the best measured so far, and
//     the one in flight.** Each estimate cell holds two whole copies of the
//     export (`artifactSizes.js`), so a naive sweep would leave three codecs'
//     worth in memory beside the source. A codec that is beaten is released
//     as soon as its figure lands, and the old best is released the moment a
//     new one displaces it. Keeping the best-so-far rather than only the
//     last-measured is what makes the selection that follows land on a filled
//     cache: Meshopt wins on the instance-heavy artifacts Share's batched
//     writer produces (−68.0% above) and is measured SECOND, so a sweep that
//     only ever held the most recent codec would have thrown the winner away
//     and made the panel re-encode up to 50 MB on the main thread. The one
//     cell exempt from all of this is `keepCodec`'s — the codec the user is
//     looking at, which the sweep may not free under them (three, then, if
//     they have selected a losing codec mid-run).
//   - **Nothing about what survives the run.** Releasing as it goes bounds
//     ONE sweep, which is self-contained and knows its own order. What should
//     still be resident afterwards depends on the panel's selection and on
//     whether another sweep has since superseded this one, and is reconciled
//     from outside (`artifactSizes.js#retainOnlyCompressedExports`).
//   - **Only the codec axis.** With quality, Portable and gzip the estimate
//     matrix is codec × quality × portable × gzip × metadata, and the cross
//     product is not something to compute on a hunch. The sweep runs the codec
//     axis at whatever quality, Portable and gzip setting is CURRENTLY
//     selected, and the caller restarts it when any of them changes.
//   - **Nothing at all above a size threshold.** Opening the Export tab on a
//     400 MB model must not start a CPU fire on the user's behalf.
//
// **Cancel stops the QUEUE, not the encoder.** This is a limitation, not a
// choice: `@gltf-transform`'s `writeBinary` drives the Draco and meshopt wasm
// synchronously and neither exposes an abort, so once a codec has started
// there is no way to stop it short of terminating the thread it is on. The
// button is labelled for what it actually does and the panel says which codec
// is still finishing — a Cancel that leaves the CPU burning while claiming
// otherwise teaches people the control doesn't work. Between codecs the
// scheduler yields to the event loop, which is both what lets the click be
// seen and what keeps the newly-landed size painting as it arrives.
//
// Design: design/new/glb-export-premium.md §4.4.
import {artifactSizes, releaseCompressedExport} from './artifactSizes'
import {COMPRESSION_DRACO, COMPRESSION_MESHOPT, COMPRESSION_NONE} from './glbCompression'


const BYTES_PER_KB = 1024
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB
const AUTO_MEASURE_MAX_MB = 50

/**
 * Above this, nothing starts on its own and the panel offers a "Calculate
 * sizes" button instead.
 *
 * 50 MB, from the measured throughput of the codecs this sweep runs: on the
 * Momentum fixture, Meshopt Balanced encodes at ~33 ms/MB and Draco Balanced
 * at ~135 ms/MB, so the whole codec axis is roughly 170 ms per MB — about 8
 * seconds of main-thread work at 50 MB, and the encoders are synchronous wasm
 * so that time is not interruptible. Below the line the sweep is over before
 * a user has finished reading the panel; above it, they should be the one who
 * asks.
 *
 * **Gzip does not move this constant, and the reason is the word
 * "interruptible"** (#1854). It measures ~35 ms/MB of input and the sweep
 * gzips both metadata sides of all three codecs, so at 50 MB it is roughly
 * another 6 seconds of wall clock — a real cost, and NOT what this threshold
 * is protecting against. The threshold exists because the wasm encoders block
 * the thread in one uninterruptible run; `CompressionStream` is fed chunk by
 * chunk off a `Blob.stream()` and awaited (`glbGzip.js`), so it yields
 * dozens of times per file and the dialog — Stop button included — stays
 * live throughout. A gzip-aware limit would trade a responsive extra six
 * seconds for a "Calculate sizes" click on models that need no such
 * protection. Worth revisiting if the panel ever grows work that is both slow
 * and blocking.
 */
export const AUTO_MEASURE_MAX_BYTES = AUTO_MEASURE_MAX_MB * BYTES_PER_MB

/**
 * The codec axis, cheapest first — the order the sweep measures in, so the
 * first figures land while the expensive one is still running.
 *
 * Measured on the Momentum fixture: `none` is a header read that never
 * touches BIN, Meshopt is ~33 ms/MB from a module already in the bundle, and
 * Draco is ~135 ms/MB behind a second wasm the page has to fetch and
 * instantiate first (`loader/glbCompress.js#loadDracoEncoder`). Note that
 * `none` stops being free when Portable is on — the rewrite reads the whole
 * artifact — but it stays cheapest of the three either way.
 */
export const CODEC_MEASUREMENT_ORDER = [COMPRESSION_NONE, COMPRESSION_MESHOPT, COMPRESSION_DRACO]


/** Callers that don't care which codec is running. */
function noop() {
  // Deliberately empty: `onCodec` is a progress signal the panel wants and a
  // test need not.
}


/**
 * Whether measuring this cell leaves a whole copy of the export in the
 * estimate cache — which is what the sweep has to release once the codec is
 * beaten.
 *
 * Mirrors `artifactSizes.js`'s own branch: uncompressed-and-native is a
 * header read and caches nothing but two numbers, and everything else runs
 * the rewrite and caches its bytes. Gzip belongs in that "everything else"
 * because it has no header shortcut — there is nothing to compress without
 * the file — so `none` in native mode stops being free the moment it is on,
 * and a sweep that still thought it was would leave the whole uncompressed
 * export resident after losing (#1854).
 *
 * @param {string} mode One of `COMPRESSION_MODES`
 * @param {boolean} isPortable
 * @param {boolean} isGzipped
 * @return {boolean}
 */
function holdsBytes(mode, isPortable, isGzipped) {
  return isPortable || isGzipped || mode !== COMPRESSION_NONE
}


/**
 * @param {?number} artifactBytes The artifact's own size, off its header
 * @param {number} [limit]
 * @return {boolean} whether the sweep may start without being asked
 */
export function shouldAutoMeasure(artifactBytes, limit = AUTO_MEASURE_MAX_BYTES) {
  return typeof artifactBytes === 'number' && artifactBytes > 0 && artifactBytes <= limit
}


/**
 * Whether every codec on the axis has reported — the one definition of "the
 * sweep is done", shared by the winner (below, which refuses to name one
 * before then) and by the panel, which offers a way to resume while this is
 * false.
 *
 * A codec that reported NULL counts: "no figure" is a settled answer.
 *
 * @param {object} sizesByCodec `{[mode]: ?sizes}`
 * @param {Array<string>} [order]
 * @return {boolean}
 */
export function isSweepComplete(sizesByCodec, order = CODEC_MEASUREMENT_ORDER) {
  return order.every((mode) => mode in sizesByCodec)
}


/**
 * The codec with the smallest measured download, or null while that is not
 * yet knowable.
 *
 * "Not yet knowable" is every codec that has not reported: a winner declared
 * before Draco has run would be a recommendation the next second contradicts.
 * A codec that reported NULL — an encoder that isn't available here, an
 * artifact that could not be read — is a settled answer of "no figure" and
 * does not hold the decision up.
 *
 * The figure compared is the one the panel is SHOWING, which is what makes
 * the selection agree with the numbers beside it: one estimate produces both
 * sides of the metadata toggle, and a winner chosen on the other side could
 * sit beside a larger number than one of the options it beat.
 *
 * @param {object} sizesByCodec `{[mode]: ?sizes}`, one entry per codec measured
 * @param {boolean} isMetadataIncluded Which of the two figures is on screen
 * @param {Array<string>} [order] Ties go to the earlier codec here
 * @return {?string} the mode, or null
 */
export function smallestCodec(sizesByCodec, isMetadataIncluded, order = CODEC_MEASUREMENT_ORDER) {
  if (!isSweepComplete(sizesByCodec, order)) {
    return null
  }
  let best = null
  let bestBytes = Infinity
  for (const mode of order) {
    const bytes = shownBytes(sizesByCodec[mode], isMetadataIncluded)
    if (bytes < bestBytes) {
      best = mode
      bestBytes = bytes
    }
  }
  return best
}


/**
 * The figure the panel is SHOWING for one codec — the one a winner is chosen
 * on, above and inside the sweep, so the two agree by construction rather
 * than by two comparisons that are supposed to match.
 *
 * A codec that reported no figure at all scores `Infinity`: a settled answer
 * of "no figure" never wins and never holds the decision up.
 *
 * @param {?object} sizes One codec's entry
 * @param {boolean} isMetadataIncluded Which of the two figures is on screen
 * @return {number} bytes, or `Infinity`
 */
function shownBytes(sizes, isMetadataIncluded) {
  if (!sizes) {
    return Infinity
  }
  return isMetadataIncluded ? sizes.withMetadata : sizes.withoutMetadata
}


/**
 * The codec the panel should switch to now, or null to leave the selection
 * alone.
 *
 * Two ways to get null, and they are different refusals. The user has chosen
 * a codec themselves — then nothing may override it, however small a
 * later-arriving figure turns out to be, because a dropdown that moves under
 * the cursor is worse than a suboptimal default. Or the sweep is not finished
 * — see `smallestCodec`.
 *
 * @param {object} sizesByCodec `{[mode]: ?sizes}`
 * @param {boolean} isMetadataIncluded
 * @param {boolean} isUserChosen Whether the user has touched the dropdown
 * @param {string} current What is selected now
 * @return {?string} the mode to select, or null
 */
export function codecToSelect(sizesByCodec, isMetadataIncluded, isUserChosen, current) {
  if (isUserChosen) {
    return null
  }
  const best = smallestCodec(sizesByCodec, isMetadataIncluded)
  return best === null || best === current ? null : best
}


/**
 * Measure every codec, in order, publishing each figure as it lands.
 *
 * Sequential by construction: the loop awaits each estimate, so two encoders
 * are never resident at once and the releases below keep memory to at most
 * two codecs' output — the best measured so far and the one in flight.
 * Resolves when the queue is done or abandoned.
 *
 * A result that arrives after the cancel is still published — it has already
 * been paid for, and "Cancel leaves whatever was computed visible and usable"
 * is the behaviour asked for. What the cancel stops is the NEXT codec.
 *
 * @param {object} artifact The store's `glbArtifact` slot
 * @param {object} options
 * @param {string} options.quality One of `exportQuality.js`'s `QUALITY_LEVELS`
 * @param {boolean} options.isPortable
 * @param {boolean} [options.isGzipped] Rank on post-gzip bytes, which is a
 *   different ranking — see the module doc
 * @param {boolean} options.isMetadataIncluded Which figure decides the winner
 * @param {AbortSignal} [options.signal] Checked between codecs; see the
 *   module doc on why it cannot be checked inside one
 * @param {Function} options.onSize `(mode, ?sizes) => void`, per codec
 * @param {Function} [options.onCodec] `(?mode) => void`, which codec is
 *   running now — the panel says so, and says it is still finishing after a
 *   cancel
 * @param {Function} [options.keepCodec] `() => ?string`, the codec whose
 *   figure is on screen. Its cell is never released here — see `release`
 * @param {Array<string>} [options.order]
 * @return {Promise<object>} `{[mode]: ?sizes}` for every codec that reported.
 *   Short of the whole axis after a Stop, which is how the caller tells a
 *   sweep that finished from one that can still be resumed
 *   (`isSweepComplete`) — the state itself is published through `onSize` as
 *   it lands, so this is a summary and not the channel.
 */
export async function measureCodecSizes(artifact, {
  quality,
  isPortable,
  isGzipped = false,
  isMetadataIncluded,
  signal,
  onSize,
  onCodec = noop,
  keepCodec = () => null,
  order = CODEC_MEASUREMENT_ORDER,
}) {
  const measured = {}
  // The codec whose figure the panel is SHOWING, read at each release rather
  // than captured once: the user can pick a codec part-way through a sweep,
  // and freeing the cell behind the number they are looking at is a defect
  // nothing downstream repairs. The size line's effect keys on the selection,
  // which has not changed again, so the cell stays empty until Export
  // re-encodes it on the main thread — up to the whole auto-measure limit
  // (#1852 review). It costs a third resident cell, and only while the
  // selected codec is one the sweep has beaten.
  const release = (mode) => {
    if (mode !== keepCodec()) {
      releaseCompressedExport(artifact, mode, isPortable, quality)
    }
  }
  // The BEST-so-far cell, kept for the selection that follows, and the figure
  // it is best by. Not the last-measured one: the winner is whichever codec
  // came in smallest, and on the instance-heavy shape Share's batched writer
  // produces that is Meshopt, measured second (module doc). `null` also covers
  // a best that holds no bytes to keep — `none` in native mode is a header
  // read — in which case there is simply nothing to release later.
  let bestHeld = null
  let bestBytes = Infinity
  try {
    for (const mode of order) {
      if (signal?.aborted) {
        return measured
      }
      onCodec(mode)
      const sizes = await artifactSizes(artifact, mode, isPortable, quality, isGzipped)
      measured[mode] = sizes
      onSize(mode, sizes)
      // Settle the keep-or-drop decision HERE, while both cells are known,
      // rather than after the loop: that is what bounds the sweep to two
      // codecs' output — the best so far and the one just measured — instead
      // of the three a release-at-the-end sweep would peak at.
      const bytes = shownBytes(sizes, isMetadataIncluded)
      if (bytes < bestBytes) {
        if (bestHeld !== null) {
          release(bestHeld)
        }
        bestBytes = bytes
        bestHeld = holdsBytes(mode, isPortable, isGzipped) ? mode : null
      } else if (holdsBytes(mode, isPortable, isGzipped)) {
        release(mode)
      }
      // Hand the event loop back between codecs. This is the whole of what
      // keeps the dialog usable: the encode itself is synchronous wasm, so
      // this yield is where the freshly-published figure paints and where a
      // Cancel click is seen.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  } finally {
    onCodec(null)
    // The loop already dropped every beaten codec, so the only cell that can
    // still be dead weight is the best-so-far of a sweep that never finished:
    // `smallestCodec` refuses to name a winner until every codec has
    // reported, so after a Stop there is no selection for those bytes to be
    // waiting for.
    //
    // The winner of a run that DID finish is left in the cache deliberately,
    // and is handed to nobody. The panel reconciles the whole cache down to
    // what it is showing once the run settles
    // (`artifactSizes.js#retainOnlyCompressedExports`), which covers this
    // cell whether the auto-selection lands on it or the user has already
    // chosen something else. Naming an owner for it instead is what the three
    // rounds before this one tried (#1852 review).
    if (bestHeld !== null && bestHeld !== smallestCodec(measured, isMetadataIncluded, order)) {
      release(bestHeld)
    }
  }
  return measured
}
