import React from 'react'
import ItemProperties from './ItemProperties'
import ItemPropertiesDrawer from './ItemPropertiesDrawer'
import {TooltipIconButton} from './Buttons'
import {decodeIFCString} from '../utils/Ifc'
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
    } else if (element.constructor && element.constructor.name) {
      titleStr = element.constructor.name
    }
  }
  // TODO(pablo) fix this sx hack
  return (
    <div style={{height: '50px'}}>
      {element && Object.keys(element).length > 0 &&
       <TooltipIconButton
         title='Properties'
         icon={<ListIcon/>}
         onClick={() => isOpenState.set(!isOpenState.value)}>
       </TooltipIconButton>
      }
      {isOpenState.value &&
       <ItemPropertiesDrawer
         content={<ItemProperties model={model} element={element}/>}
         title={titleStr}
         onClose={() => isOpenState.set(false)}/>
      }
    </div>
  )
}
