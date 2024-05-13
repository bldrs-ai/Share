import React, {ReactElement, useEffect} from 'react'
import {useLocation} from 'react-router'
import useStore from '../../store/useStore'
import {getParams, removeParams} from '../../utils/location'
import {CloseButton} from '../Buttons'
import NoContent from '../NoContent'
import PanelWithTitle from '../SideDrawer/PanelWithTitle'
import Properties from './Properties'
import {HASH_PREFIX_PROPERTIES} from './hashState'


/**
 * PropertiesPanel is a wrapper for the item properties component.  It
 * contains the title with additional controls, and the item
 * properties styled container
 *
 * @property {boolean} Include gutter Should be present only when
 *     Properties occupies full SideDrawer.
 * @return {ReactElement} Properties Panel react component
 */
export default function PropertiesPanel({includeGutter}) {
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
  function onCloseClick() {
    setIsPropertiesVisible(false)
    removeParams(HASH_PREFIX_PROPERTIES)
  }

  return (
    <PanelWithTitle
      title={'PROPERTIES'}
      controlsGroup={<CloseButton onCloseClick={onCloseClick}/>}
      includeGutter={includeGutter}
    >
      {selectedElement ?
        <Properties/> :
        <NoContent message={'Please select an element to access properties.'}/>
      }
    </PanelWithTitle>
  )
}
