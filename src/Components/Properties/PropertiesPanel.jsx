import React, {ReactElement, useEffect} from 'react'
import {useLocation} from 'react-router'
import useStore from '../../store/useStore'
import NoContent from '../NoContent'
import Panel from '../SideDrawer/Panel'
import Properties from './Properties'
import {getHashParams, removeHashParams} from './hashState'


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
        <Properties/> :
        <NoContent message='Please select an element to access properties.'/>
      }
    </Panel>
  )
}


export const TITLE = 'Properties'
