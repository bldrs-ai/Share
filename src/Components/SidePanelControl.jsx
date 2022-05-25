import React from 'react'
import {TooltipIconButton} from './Buttons'


/**
 * Container for ItemProperties. ItemProperties is wrapped in an
 * ItemPropertiesDrawer to toggle hiding.
 * @param {Object} model IFC model
 * @param {Object} element The currently selected IFC element
 * @param {Object} isOpenState React state object: {value, set}
 * @return {Object} React components
 */
export default function SidePanelControl({icon, onClick}) {
  return (
    <>
      <TooltipIconButton
        title='Properties'
        icon={icon}
        onClick={onClick}/>
    </>
  )
}


