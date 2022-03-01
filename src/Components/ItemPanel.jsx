import React from 'react'
import ItemProperties from './ItemProperties'
import ItemPropertiesDrawer from './ItemPropertiesDrawer'
import {TooltipIconButton} from './Buttons'
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
  return (
    <>
      {element && Object.keys(element).length > 0 &&
       <TooltipIconButton
         title='Properties'
         icon={<ListIcon/>}
         onClick={() => {
           isOpenState.set(!isOpenState.value)
           // onClickCb()
         }}>
       </TooltipIconButton>
      }
      {isOpenState.value &&
       <ItemPropertiesDrawer
         content={<ItemProperties model={model} element={element}/>}
         title={'IFC Information'}
         onClose={() => {
           isOpenState.set(false)
           // onClickCb()
         }}
       />
      }
    </>
  )
}
