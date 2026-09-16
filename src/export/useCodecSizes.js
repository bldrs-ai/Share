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
import {uncompressedSizes} from './artifactSizes'
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
 * `compression` is not a restart axis either, and is here for one reason: the
 * sweep releases the codecs it beats, and the user may have SELECTED one of
 * them part-way through. What survives a run is reconciled by the panel
 * (`artifactSizes.js#retainOnlyCompressedExports`); what must survive DURING
 * one only the run can protect, so the selection is passed down to it.
 *
 * @param {?object} artifact The store's `glbArtifact` slot
 * @param {object} options
 * @param {string} options.quality One of `exportQuality.js`'s `QUALITY_LEVELS`
 * @param {boolean} options.isPortable
 * @param {boolean} [options.isGzipped]
 * @param {boolean} options.isMetadataIncluded
 * @param {?string} [options.compression] The codec on screen, whose cell no
 *   sweep may free
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
export default function useCodecSizes(
  artifact, {quality, isPortable, isGzipped = false, isMetadataIncluded, compression = null}) {
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
  // Read by the run at each of its releases, so a codec picked mid-sweep is
  // protected from the moment it is picked. A SUPERSEDED sweep reads this ref
  // too, which is the point: whichever generation a release comes from, it is
  // measured against the one selection the user actually has.
  const selectedCodecRef = useRef(compression)
  selectedCodecRef.current = compression

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
        // Ungenerationed on purpose, unlike the two above. This decides only
        // what the run may FREE, and the answer is the same for a live sweep
        // and a dead one: the cell behind the figure on screen. The cells a
        // run leaves behind are nobody's here — the panel reconciles them
        // against its own selection once the run settles
        // (`artifactSizes.js#retainOnlyCompressedExports`), which is what
        // replaced three rounds of trying to name an owner for them (#1852
        // review).
        keepCodec: () => selectedCodecRef.current,
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
  }, [artifact, quality, isPortable, isGzipped])

  useEffect(() => {
    let isStale = false
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
      // Ending the old sweep's GENERATION is the teardown's job, and only the
      // teardown's. Two reasons it cannot be left to the next effect body:
      // `run` is reached through an await, so the superseded codec — already
      // in flight, uninterruptible — can resolve in the gap before the new
      // sweep installs its own controller; and on unmount there is no next
      // body at all, so a dead sweep would go on publishing figures into a
      // hook nobody is rendering (#1852 review). Nulling here is what makes
      // "am I still the live sweep?" answerable, above, after the panel has
      // gone.
      abortRef.current = null
    }
  }, [artifact, run])

  return {sizesByCodec, measuringCodec, isMeasuring, isStopping, isPaused, start: run, stop}
}
