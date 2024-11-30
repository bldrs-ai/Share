import React, {ReactElement, useEffect} from 'react'
import {useLocation} from 'react-router'
import useStore from '../../store/useStore'
import {getParams, removeParams} from '../../utils/location'
import NoContent from '../NoContent'
import Panel from '../SideDrawer/Panel'
import Properties from './Properties'
import {HASH_PREFIX_PROPERTIES} from './hashState'


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

  useEffect(() => {
    const propsParams = getParams(location, HASH_PREFIX_PROPERTIES)
    if (propsParams) {
      setIsPropertiesVisible(true)
    }
  }, [location, setIsPropertiesVisible])

  /** Hide panel and remove hash state */
  function onClose() {
    setIsPropertiesVisible(false)
    removeParams(HASH_PREFIX_PROPERTIES)
  }

  return (
    <Panel
      title='Properties'
      onClose={onClose}
      data-testid='PropertiesPanel'
    >
      {selectedElement ?
        <Properties/> :
        <NoContent message='Please select an element to access properties.'/>
      }
    </Panel>
  )
}
