import React from 'react'
import ButtonGroup from '@mui/material/ButtonGroup'
import OpenModelControl from './OpenModelControl'
import useStore from '../store/useStore'
import {TooltipIconButton} from './Buttons'
import SearchIcon from '@mui/icons-material/Search'
import TreeIcon from '../assets/icons/Tree.svg'


/**
 * Controls gropup contains visibility toggle for serach, spatial navigation and search
 *
 * @property {Function} fileOpen function that is passed to to the openControl for open localfiles
 * @return {React.Component}
 */
export default function ControlsGroup({fileOpen}) {
  const toggleIsNavigationVisible = useStore((state) => state.toggleIsNavigationVisible)
  const isNavigationVisible = useStore((state) => state.isNavigationVisible)
  const toggleIsSearchVisible = useStore((state) => state.toggleIsSearchVisible)
  const isSearchVisible = useStore((state) => state.isSearchVisible)

  return (
    <ButtonGroup
      orientation='horizontal'
      variant='contained'
    >
      <OpenModelControl fileOpen={fileOpen}/>
      <TooltipIconButton
        title='Search'
        icon={<SearchIcon className='icon-share' color='secondary'/>}
        placement='bottom'
        aboutInfo={false}
        selected={isSearchVisible}
        onClick={toggleIsSearchVisible}
      />
      <TooltipIconButton
        title='Navigation'
        icon={<TreeIcon className='icon-share' color='secondary' style={{width: '17px', height: '17px'}}/>}
        placement='bottom'
        aboutInfo={false}
        selected={isNavigationVisible}
        onClick={toggleIsNavigationVisible}
      />
    </ButtonGroup>
  )
}
