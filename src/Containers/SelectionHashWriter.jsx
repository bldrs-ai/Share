import {useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import {fileSuffixBoundaryRegex} from '../Filetype'
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
  const selectedOccurrencePath = useStore((state) => state.selectedOccurrencePath)
  // Re-checked when the path changes: a single selection's navigation can
  // land after the selection itself.
  const {pathname} = useLocation()

  useEffect(() => {
    if (!isModelReady || !viewer?.isolator?.ifcModel) {
      return
    }
    const isSearch = new URLSearchParams(window.location.search).has('q')
    const anchors = isSearch ? [] : (selectedAnchorIds ?? [])
    // Does the path name a single selection's row? A single occurrence
    // selection is written to the path from its occurrence path (and may be
    // keyed by the geometry's product id, which the path doesn't carry), so
    // it always does; otherwise the path's last element must be the row.
    const pathNamesSelection = anchors.length !== 1 ||
      (Array.isArray(selectedOccurrencePath) && selectedOccurrencePath.length > 0) ||
      pathElementId() === Number(anchors[0])
    writeSelectionHash(window.location, viewer, anchors, pathNamesSelection)
  }, [viewer, isModelReady, selectedAnchorIds, selectedOccurrencePath, pathname])

  return null
}


/** @return {number|null} the last element id in the URL path below the model file */
function pathElementId() {
  const parts = window.location.pathname.split(fileSuffixBoundaryRegex)
  const last = parts.length === 2 ? parts[1].split('/').filter(Boolean).pop() : undefined
  return last && /^\d+$/.test(last) ? Number(last) : null
}
