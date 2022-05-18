import React from 'react'
import SideDrawer from './SideDrawer'
import {TooltipIconButton} from './Buttons'
import {useIsMobile} from './Hooks'
import MobileDrawer from './MobileDrawer'
import useStore from '../utils/store'


/**
 * Container for ItemProperties. ItemProperties is wrapped in an
 * ItemPropertiesDrawer to toggle hiding.
 * @param {Object} model IFC model
 * @param {Object} element The currently selected IFC element
 * @param {Object} isOpenState React state object: {value, set}
 * @return {Object} React components
 */
export default function SidePanelControl({icon, content, onClick}) {
  const isDrawerOpen = useStore((state) => state.isDrawerOpen)
  const closeDrawer = useStore((state) => state.closeDrawer)
  const isMobile = useIsMobile()
  return (
    <>
      <TooltipIconButton
        title='Properties'
        icon={icon}
        onClick={onClick}/>
      {isDrawerOpen &&
        (isMobile ? <MobileDrawer/> :
        <SideDrawer
          content={content}
          title={'title'}
          onClose={closeDrawer}/>)}
    </>
  )
}


