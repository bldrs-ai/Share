import React, {ReactElement, useEffect} from 'react'
import {useLocation} from 'react-router'
import {ErrorBoundary} from '@sentry/react'
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
        // Keyed on the selection, so picking another element retries.
        // Sentry's boundary, as at the root, so the failure is still reported.
        <ErrorBoundary
          key={selectedElement.expressID ?? 'selected'}
          fallback={<NoContent message={PROPERTIES_RENDER_FAILED_MESSAGE}/>}
        >
          <Properties/>
        </ErrorBoundary> :
        <NoContent message='Please select an element to access properties.'/>
      }
    </Panel>
  )
}
