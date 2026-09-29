import {useEffect} from 'react'
import useStore from '../store/useStore'
import {writeSelectionHash} from './selectionHash'


/**
 * Keeps the `#sel:` token (selectionHash.js) in step with the selection's
 * rows. Renders nothing, so a selection change re-renders this rather than
 * all of CadView.
 *
 * Gated on `isModelReady`, which `CadView#onViewer` raises only after it has
 * restored the incoming link's selection: writing before then would strip it
 * unread. A search (`?q=`) restores its own results, so its selection isn't
 * written.
 *
 * @return {null}
 */
export default function SelectionHashWriter() {
  const viewer = useStore((state) => state.viewer)
  const isModelReady = useStore((state) => state.isModelReady)
  const selectedAnchorIds = useStore((state) => state.selectedAnchorIds)

  useEffect(() => {
    if (!isModelReady || !viewer?.isolator?.ifcModel) {
      return
    }
    const isSearch = new URLSearchParams(window.location.search).has('q')
    writeSelectionHash(window.location, viewer, isSearch ? [] : (selectedAnchorIds ?? []))
  }, [viewer, isModelReady, selectedAnchorIds])

  return null
}
