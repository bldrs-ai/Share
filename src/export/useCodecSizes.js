// The Export tab's background codec sweep, as React sees it (#1850).
//
// `codecSizes.js` owns the decisions — the order, the release, the threshold,
// which codec wins. This is the wiring around them: one run at a time, torn
// down and restarted whenever an axis the figures depend on changes, and a
// Cancel that is a real `AbortController` rather than a discarded result.
//
// Restart-on-axis-change is the subtle part. The sweep measures the codec
// axis AT the currently-selected quality, Portable and gzip setting, so
// changing any of them invalidates every figure it has published — showing
// the old numbers under the new setting would be exactly the stale-estimate
// lie the size line's `data-estimate-key` exists to prevent. The effect below
// therefore aborts, clears and re-runs on all three, and on a new artifact.
// Gzip is the one whose figures move MOST: it does not merely scale them, it
// can reorder the codecs outright (`codecSizes.js` module doc), so a sweep
// that carried its raw figures across the toggle would auto-select the wrong
// codec rather than merely quote a stale number.
//
// Design: design/new/glb-export-premium.md §4.4.
import {useCallback, useEffect, useRef, useState} from 'react'
import {releaseCompressedExport, uncompressedSizes} from './artifactSizes'
import {isSweepComplete, measureCodecSizes, shouldAutoMeasure} from './codecSizes'


/**
 * Every codec's real download size for the current artifact, measured in the
 * background while the tab is open.
 *
 * `isMetadataIncluded` is deliberately NOT a restart axis: one estimate
 * produces both sides, so flipping that toggle moves every figure without a
 * single re-encode, exactly as it does on the size line. It is passed in only
 * so the run's releases keep the codec the panel will select.
 *
 * @param {?object} artifact The store's `glbArtifact` slot
 * @param {object} options
 * @param {string} options.quality One of `exportQuality.js`'s `QUALITY_LEVELS`
 * @param {boolean} options.isPortable
 * @param {boolean} [options.isGzipped]
 * @param {boolean} options.isMetadataIncluded
 * @return {{
 *   sizesByCodec: object,
 *   measuringCodec: ?string,
 *   isMeasuring: boolean,
 *   isStopping: boolean,
 *   isPaused: boolean,
 *   start: Function,
 *   stop: Function,
 * }}
 */
export default function useCodecSizes(artifact, {quality, isPortable, isGzipped = false, isMetadataIncluded}) {
  const [sizesByCodec, setSizesByCodec] = useState({})
  const [measuringCodec, setMeasuringCodec] = useState(null)
  const [isMeasuring, setIsMeasuring] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  // The sweep is parked with codecs still unmeasured and will only go on if
  // it is asked to. Two ways in, and the panel treats them the same because
  // the way OUT is the same: held back by the size threshold before it ever
  // started, or stopped by the user part-way through. Written as "suppressed"
  // (threshold only) this state was a one-way door — Stop cleared it, the
  // status row it gates unmounted with the Stop and the Calculate buttons
  // inside it, and a partly-measured sweep could never be finished or its
  // winner selected (#1852 review).
  const [isPaused, setIsPaused] = useState(false)

  const abortRef = useRef(null)
  // What the RUN needs but must not restart on. A ref rather than a
  // dependency: the metadata toggle changes which figure is on screen, and
  // re-running three encoders for that would be absurd.
  const metadataRef = useRef(isMetadataIncluded)
  metadataRef.current = isMetadataIncluded
  // How to release the one cell the last sweep left in the estimate cache.
  // A thunk rather than the mode, because releasing needs the artifact,
  // Portable and quality THAT sweep ran at, and by the time this is called
  // the render's own values may have moved on.
  const releaseRetainedRef = useRef(null)

  // Nothing outside a sweep reuses the retained cell: remounting the panel
  // re-runs the whole axis from scratch, so a winner held past the sweep that
  // produced it is never read again. Hence release on unmount and on restart,
  // and release the previous one before recording a new one — a sweep that
  // finished just before being superseded would otherwise strand its winner
  // for the life of the artifact, which the store holds for the whole session.
  // Releasing only drops a cache entry (`artifactSizes.js`), so an export
  // already holding the promise still resolves; the cost of being wrong here
  // is a re-encode, not a failure.
  const releaseRetained = useCallback(() => {
    releaseRetainedRef.current?.()
    releaseRetainedRef.current = null
  }, [])

  const stop = useCallback(() => {
    // The encoders are synchronous wasm with no abort, so this ends the QUEUE
    // and the codec in flight runs to completion — `isStopping` is what lets
    // the panel say so instead of pretending otherwise (`codecSizes.js`).
    abortRef.current?.abort()
    setIsStopping(true)
  }, [])

  const run = useCallback(async () => {
    if (!artifact) {
      return
    }
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    setIsPaused(false)
    setIsMeasuring(true)
    setIsStopping(false)
    // What the run got through, so the `finally` can tell a sweep that
    // finished from one a Stop cut short. `sizesByCodec` cannot answer that
    // here: it is this closure's stale copy, and reading it through a
    // functional setState would mean a side effect inside an updater.
    let measured = {}
    try {
      measured = await measureCodecSizes(artifact, {
        quality,
        isPortable,
        isGzipped,
        isMetadataIncluded: metadataRef.current,
        signal: controller.signal,
        // Guarded on GENERATION, not on the abort — the two are different
        // and conflating them loses one of the behaviours. A figure that
        // lands after Stop is still THIS sweep's, and is published: it has
        // already been paid for, and Stop is meant to leave what was
        // computed usable. A figure from a SUPERSEDED sweep is dropped. Both
        // are aborted runs; only the second one is measuring the wrong
        // thing. It happens because the encoders are synchronous wasm with
        // no abort, so a quality or Portable change stops the old sweep's
        // next codec but not the one already running — and publishing that
        // would mix rungs in `sizesByCodec`, which is the set auto-select
        // reads the winner off, and satisfy `data-codec-sizes` with figures
        // measured at two different settings.
        onSize: (mode, sizes) => {
          if (abortRef.current !== controller) {
            return
          }
          setSizesByCodec((previous) => ({...previous, [mode]: sizes}))
        },
        onCodec: (mode) => {
          if (abortRef.current !== controller) {
            return
          }
          setMeasuringCodec(mode)
        },
        // Unguarded by generation, deliberately: a superseded sweep's
        // retained cell is exactly the one nobody else will ever release.
        onRetain: (mode) => {
          releaseRetained()
          releaseRetainedRef.current = mode === null ?
            null :
            () => releaseCompressedExport(artifact, mode, isPortable, quality)
        },
      })
    } finally {
      if (abortRef.current === controller) {
        setIsMeasuring(false)
        setIsStopping(false)
        // Park rather than vanish. `start` re-runs the whole axis from
        // scratch — the released cells have to be re-encoded either way
        // (`codecSizes.js`) — which is why this is the same state, and the
        // same button, as the threshold's.
        setIsPaused(!isSweepComplete(measured))
      }
    }
  }, [artifact, quality, isPortable, isGzipped, releaseRetained])

  useEffect(() => {
    let isStale = false
    abortRef.current?.abort()
    // Ends the old sweep's GENERATION here, not when the new run starts:
    // `run` is reached through an await, and the superseded codec — already
    // in flight, uninterruptible — can resolve inside that gap. While
    // `abortRef` still held it, its callbacks would pass the guard above and
    // publish into the state this effect has just cleared.
    abortRef.current = null
    setSizesByCodec({})
    setMeasuringCodec(null)
    setIsMeasuring(false)
    setIsStopping(false)
    setIsPaused(false)
    // The threshold reads the artifact's own header — the same cheap,
    // already-cached read the uncompressed size line makes — so deciding NOT
    // to sweep costs nothing itself.
    uncompressedSizes(artifact).then((sizes) => {
      if (isStale) {
        return
      }
      if (shouldAutoMeasure(sizes?.withMetadata ?? null)) {
        run()
      } else if (artifact && sizes) {
        setIsPaused(true)
      }
    })
    return () => {
      isStale = true
      abortRef.current?.abort()
      releaseRetained()
    }
  }, [artifact, run, releaseRetained])

  return {sizesByCodec, measuringCodec, isMeasuring, isStopping, isPaused, start: run, stop}
}
