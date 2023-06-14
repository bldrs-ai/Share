import React from 'react'
import Paper from '@mui/material/Paper'
import {TooltipIconButton} from './Buttons'
import useStore from '../store/useStore'
import TypesIcon from '../assets/icons/Types.svg'
import ElementsIcon from '../assets/icons/Elements.svg'


/**
 * Controls group contains toggles for fileapth, branches, spatial navigation, and element type navigation
 *
 * @param {Function} modelPath object containing information about the location of the model
 * @return {React.Component}
 */
export default function NavigationGroup() {
  const isNavPanelOpen = useStore((state) => state.isNavPanelOpen)
  const isElementNavigation = useStore((state) => state.isElementNavigation)
  const setElementNavigation = useStore((state) => state.setElementNavigation)
  const setTypeNavigation = useStore((state) => state.setTypeNavigation)
  const showNavPanel = useStore((state) => state.showNavPanel)
  const hideNavPanel = useStore((state) => state.hideNavPanel)

  const toggleIsNavPanelOpen = (isElementNavigationLocal) => {
    if (isNavPanelOpen && isElementNavigationLocal === isElementNavigation ) {
      hideNavPanel()
    } else {
      showNavPanel()
    }
  }

  return (
    <Paper
      elevation={1}
      variant='control'
      sx={{
        position: 'absolute',
        // top: `1em`,
        left: '11.3em',
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'flex-start',
        marginLeft: '5px',
        borderRadius: '10px',
        opacity: .9,
      }}
    >
      <TooltipIconButton
        showTitle={true}
        placement={'bottom'}
        title={`Elements`}
        selected={isElementNavigation === true && isNavPanelOpen}
        onClick={() => {
          setElementNavigation()
          toggleIsNavPanelOpen(true)
        }}
        icon={<ElementsIcon style={{width: '15px', height: '15px'}}/>}
      />
      <TooltipIconButton
        showTitle={true}
        placement={'bottom'}
        title={`Types`}
        selected={isElementNavigation !== true && isNavPanelOpen}
        onClick={() => {
          setTypeNavigation()
          toggleIsNavPanelOpen(false)
        }}
        icon={<TypesIcon style={{width: '15px', height: '15px'}}/>}
      />
    </Paper>
  )
}
