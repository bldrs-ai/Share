import React, {ReactElement, useEffect, useRef} from 'react'
import {useLocation} from 'react-router'
import {ErrorBoundary} from '@sentry/react'
import {selectReadModel} from '../../store/IFCSlice'
import useStore from '../../store/useStore'
import NoContent from '../NoContent'
import Panel from '../SideDrawer/Panel'
import Properties from './Properties'
import {getHashParams, removeHashParams} from './hashState'
import {TITLE} from './component'


/** What the panel shows in place of properties it could not render. */
export const PROPERTIES_RENDER_FAILED_MESSAGE = 'These properties could not be shown.'


/**
 * PropertiesPanel is a wrapper for the item properties component.  It
 * contains the title with additional controls, and the item
 * properties styled container
 *
 * @return {ReactElement}
 */
export default function PropertiesPanel() {
  const selectedElement = useStore((state) => state.selectedElement)
  const setIsPropertiesVisible = useStore((state) => state.setIsPropertiesVisible)
  const location = useLocation()


  /** Hide panel and remove hash state */
  function onClose() {
    setIsPropertiesVisible(false)
    removeHashParams()
  }


  useEffect(() => {
    const propsParams = getHashParams(location)
    if (propsParams) {
      setIsPropertiesVisible(true)
    }
  }, [location, setIsPropertiesVisible])


  return (
    <Panel title={TITLE} onClose={onClose} data-testid='PropertiesPanel'>
      {selectedElement ?
        // The panel's own boundary: one element whose properties fail to
        // render costs this panel, not the app. Without it a render throw
        // reached the root ErrorBoundary in index.jsx, which replaces the
        // whole page with ApplicationError (Share#2063: an IfcGrid's axes).
        // Sentry's boundary, as at the root, so the failure is still
        // reported. NOT keyed on the selection: that would remount
        // <Properties/> on every click and drop its state (expand-all).
        // The fallback resets the boundary itself once the selection or
        // the model changes. Passed as the component itself: Sentry
        // createElement()s a function fallback, so an inline arrow would be
        // a new component type per render and remount the fallback (losing
        // what it captured as "the selection that failed").
        <ErrorBoundary fallback={PropertiesRenderFailed}>
          <Properties/>
        </ErrorBoundary> :
        <NoContent message='Please select an element to access properties.'/>
      }
    </Panel>
  )
}


/**
 * Shown by the panel's ErrorBoundary in place of properties that threw while
 * rendering. Retries (resets the boundary) as soon as the selection or the
 * read model differs from the one that failed: another element picked, or
 * the indexed model swapped for the finished one at load end.
 *
 * @property {Function} resetError the boundary's reset
 * @return {ReactElement}
 */
function PropertiesRenderFailed({resetError}) {
  const selectedElement = useStore((state) => state.selectedElement)
  const model = useStore(selectReadModel)
  // What failed, captured at mount: resetting on mount would only re-throw.
  const failed = useRef({selectedElement, model})
  useEffect(() => {
    if (selectedElement !== failed.current.selectedElement || model !== failed.current.model) {
      resetError()
    }
  }, [selectedElement, model, resetError])
  return <NoContent message={PROPERTIES_RENDER_FAILED_MESSAGE}/>
}
