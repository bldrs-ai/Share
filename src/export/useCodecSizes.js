// The Export tab's background codec sweep, as React sees it (#1850).
//
// `codecSizes.js` owns the decisions — the order, the release, the threshold,
// which codec wins. This is the wiring around them: one run at a time, torn
// down and restarted whenever an axis the figures depend on changes, and a
// Cancel that is a real `AbortController` rather than a discarded result.
//
// Restart-on-axis-change is the subtle part. The sweep measures the codec
// axis AT the currently-selected quality and Portable setting, so changing
// either invalidates every figure it has published — showing the old numbers
// under the new setting would be exactly the stale-estimate lie the size
// line's `data-estimate-key` exists to prevent. The effect below therefore
// aborts, clears and re-runs on both, and on a new artifact.
//
// Design: design/new/glb-export-premium.md §4.4.
import {useCallback, useEffect, useRef, useState} from 'react'
import {uncompressedSizes} from './artifactSizes'
import {measureCodecSizes, shouldAutoMeasure} from './codecSizes'


/**
 * Every codec's real download size for the current artifact, measured in the
 * background while the tab is open.
 *
 * `isMetadataIncluded` is deliberately NOT a restart axis: one estimate
 * produces both sides, so flipping that toggle moves every figure without a
 * single re-encode, exactly as it does on the size line. It is passed in only
 * so the run's final release keeps the codec the panel will select.
 *
 * @param {?object} artifact The store's `glbArtifact` slot
 * @param {object} options
 * @param {string} options.quality One of `exportQuality.js`'s `QUALITY_LEVELS`
 * @param {boolean} options.isPortable
 * @param {boolean} options.isMetadataIncluded
 * @return {{
 *   sizesByCodec: object,
 *   measuringCodec: ?string,
 *   isMeasuring: boolean,
 *   isStopping: boolean,
 *   isSuppressed: boolean,
 *   start: Function,
 *   stop: Function,
 * }}
 */
export default function useCodecSizes(artifact, {quality, isPortable, isMetadataIncluded}) {
  const [sizesByCodec, setSizesByCodec] = useState({})
  const [measuringCodec, setMeasuringCodec] = useState(null)
  const [isMeasuring, setIsMeasuring] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  // The sweep was held back by the size threshold and is waiting to be asked.
  const [isSuppressed, setIsSuppressed] = useState(false)

  const abortRef = useRef(null)
  // What the RUN needs but must not restart on. A ref rather than a
  // dependency: the metadata toggle changes which figure is on screen, and
  // re-running three encoders for that would be absurd.
  const metadataRef = useRef(isMetadataIncluded)
  metadataRef.current = isMetadataIncluded

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
    setIsSuppressed(false)
    setIsMeasuring(true)
    setIsStopping(false)
    try {
      await measureCodecSizes(artifact, {
        quality,
        isPortable,
        isMetadataIncluded: metadataRef.current,
        signal: controller.signal,
        // Published even after a cancel: that figure has already been paid
        // for, and Cancel is meant to leave what was computed usable.
        onSize: (mode, sizes) => setSizesByCodec((previous) => ({...previous, [mode]: sizes})),
        onCodec: (mode) => setMeasuringCodec(mode),
      })
    } finally {
      if (abortRef.current === controller) {
        setIsMeasuring(false)
        setIsStopping(false)
      }
    }
  }, [artifact, quality, isPortable])

  useEffect(() => {
    let isStale = false
    abortRef.current?.abort()
    setSizesByCodec({})
    setMeasuringCodec(null)
    setIsMeasuring(false)
    setIsStopping(false)
    setIsSuppressed(false)
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
        setIsSuppressed(true)
      }
    })
    return () => {
      isStale = true
      abortRef.current?.abort()
    }
  }, [artifact, run])

  return {sizesByCodec, measuringCodec, isMeasuring, isStopping, isSuppressed, start: run, stop}
}
