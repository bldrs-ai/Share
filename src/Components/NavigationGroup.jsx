import React from 'react'
import Box from '@mui/material/Box'
import {TooltipIconButton} from './Buttons'
import useStore from '../store/useStore'
import TypesIcon from '../assets/icons/Types.svg'
import ElementsIcon from '../assets/icons/Elements.svg'
import SetsIcon from '../assets/icons/Sets.svg'


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
  // const showNavPanel = useStore((state) => state.showNavPanel)
  // const hideNavPanel = useStore((state) => state.hideNavPanel)

  // const toggleIsNavPanelOpen = (isElementNavigationLocal) => {
  //   if (isNavPanelOpen && isElementNavigationLocal === isElementNavigation ) {
  //     hideNavPanel()
  //   } else {
  //     showNavPanel()
  //   }
  // }

  return (
    <Box
      // elevation={1}
      variant='control'
      sx={{
        // position: 'absolute',
        // top: `1em`,
        // left: '11em',
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'flex-start',
        // marginLeft: '5px',
        // borderRadius: '10px',
        opacity: .9,
        // borderBottom: '1px solid lightgrey',
      }}
    >
      <TooltipIconButton
        showTitle={true}
        placement={'bottom'}
        title={`Elements`}
        selected={isElementNavigation === true && isNavPanelOpen}
        onClick={() => {
          setElementNavigation()
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
        }}
        icon={<TypesIcon style={{width: '15px', height: '15px'}}/>}
      />
      <TooltipIconButton
        showTitle={true}
        placement={'bottom'}
        title={`Sets`}
        onClick={() => {
          setTypeNavigation()
        }}
        icon={<SetsIcon style={{width: '15px', height: '15px'}}/>}
      />
    </Box>
  )
}
