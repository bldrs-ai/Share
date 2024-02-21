import React, {useEffect} from 'react'
import {useLocation} from 'react-router'
import useStore from '../../store/useStore'
import {addHashParams, getHashParams, removeHashParams} from '../../utils/location'
import {CloseButton} from '../Buttons'
import NoContent from '../NoContent'
import PanelWithTitle from '../SideDrawer/PanelWithTitle'
import Properties from './Properties'
import {PROPERTIES_PREFIX} from './PropertiesControl'


/**
 * PropertiesPanel is a wrapper for the item properties component.  It
 * contains the title with additional controls, and the item
 * properties styled container
 *
 * @property {boolean} Include gutter Should be present only when
 *     Properties occupies full SideDrawer.
 * @return {React.ReactElement} Properties Panel react component
 */
export default function PropertiesPanel({includeGutter}) {
  const selectedElement = useStore((state) => state.selectedElement)
  const isPropertiesVisible = useStore((state) => state.isPropertiesVisible)
  const setIsPropertiesVisible = useStore((state) => state.setIsPropertiesVisible)

  const location = useLocation()

  useEffect(() => {
    const propsParams = getHashParams(location, PROPERTIES_PREFIX)
    if (propsParams) {
      setIsPropertiesVisible(true)
    }
  }, [location, setIsPropertiesVisible])

  /** Toggle properties visibility and set url state token */
  function onCloseClick() {
    if (isPropertiesVisible) {
      setIsPropertiesVisible(false)
      removeHashParams(window.location, PROPERTIES_PREFIX)
    } else {
      setIsPropertiesVisible(true)
      addHashParams(window.location, PROPERTIES_PREFIX)
    }
  }

  return (
    <PanelWithTitle
      title={'PROPERTIES'}
      controlsGroup={<CloseButton onClick={onCloseClick}/>}
      includeGutter={includeGutter}
    >
      {selectedElement ?
        <Properties/> :
        <NoContent message={'Please select an element to access properties.'}/>
      }
    </PanelWithTitle>
  )
}
