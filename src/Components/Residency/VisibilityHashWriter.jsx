import {useEffect} from 'react'
import useStore from '../../store/useStore'
import {writeVisibilityHash} from './visibilityHash'


/**
 * Keeps the `#d:` token's hide / isolate terms in step with the isolator
 * (visibilityHash.js), the way ResidencyControl keeps its display terms. A
 * component of its own, rendering nothing, so a hide re-renders this rather
 * than all of CadView.
 *
 * Gated on `isModelReady`, which `CadView#onViewer` raises only after it has
 * applied the incoming link's terms: writing before then would replace them
 * with the model's defaults before they were read.
 *
 * @return {null}
 */
export default function VisibilityHashWriter() {
  const viewer = useStore((state) => state.viewer)
  const isModelReady = useStore((state) => state.isModelReady)
  // The isolator publishes every hide / isolate change to these; the writer
  // reads the isolator itself, which holds what the ids alone don't (the
  // loader's defaults, STEP occurrence paths).
  const hiddenElements = useStore((state) => state.hiddenElements)
  const isolatedElements = useStore((state) => state.isolatedElements)
  const isTempIsolationModeOn = useStore((state) => state.isTempIsolationModeOn)

  useEffect(() => {
    if (isModelReady && viewer?.isolator?.ifcModel) {
      writeVisibilityHash(window.location, viewer)
    }
  }, [viewer, isModelReady, hiddenElements, isolatedElements, isTempIsolationModeOn])

  return null
}
