import React from 'react'
import ItemProperties from './ItemProperties'
import ItemPropertiesDrawer from './ItemPropertiesDrawer'
import {TooltipIconButton} from './Buttons'
import {useIsMobile} from './Hooks'
import MobileDrawer from './MobileDrawer'
import {decodeIFCString} from '../utils/Ifc'
import CloseIcon from '../assets/2D_Icons/Close.svg'
import ListIcon from '../assets/2D_Icons/List.svg'


/**
 * Container for ItemProperties. ItemProperties is wrapped in an
 * ItemPropertiesDrawer to toggle hiding.
 * @param {Object} model IFC model
 * @param {Object} element The currently selected IFC element
 * @param {Object} isOpenState React state object: {value, set}
 * @return {Object} React components
 */
export default function ItemPanelControl({model, element, isOpenState}) {
  let titleStr = 'Element Properties'
  if (model) {
    if (element.Name && element.Name.value) {
      titleStr = decodeIFCString(element.Name.value)
      document.title = titleStr
    } else if (element.constructor && element.constructor.name) {
      titleStr = element.constructor.name
    }
  }
  const isMobile = useIsMobile()
  const itemProps = <ItemProperties model={model} element={element}/>
  if (element) {
    return (
      <>
        {Object.keys(element).length > 0 &&
         <TooltipIconButton
           title='Properties'
           icon={isOpenState.value ? <CloseIcon/> : <ListIcon/>}
           onClick={() => isOpenState.set(!isOpenState.value)}/>}
        {isOpenState.value &&
         (isMobile ? <MobileDrawer content={itemProps}/> :
         <ItemPropertiesDrawer
           content={itemProps}
           title={titleStr}
           onClose={() => isOpenState.set(false)}/>)}
      </>
    )
  }
  return null
}


