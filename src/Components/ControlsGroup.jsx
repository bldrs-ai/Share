import React from 'react'
import ButtonGroup from '@mui/material/ButtonGroup'
import useStore from '../store/useStore'
import {TooltipIconButton} from './Buttons'
import OpenModelControl from './OpenModelControl'
import SaveModelControl from './SaveModelControl'
import HistoryIcon from '@mui/icons-material/History'
import SearchIcon from '@mui/icons-material/Search'
import TreeIcon from '../assets/icons/Tree.svg'


/**
 * @property {Function} navigate Callback from CadView to change page url
 * @property {Function} isRepoActive deselects currently selected element
 * @return {React.Component}
 */
export default function ControlsGroup({navigate, isRepoActive}) {
  const isNavigationVisible = useStore((state) => state.isNavigationVisible)
  const toggleIsNavigationVisible = useStore((state) => state.toggleIsNavigationVisible)
  const isSearchVisible = useStore((state) => state.isSearchVisible)
  const toggleIsSearchVisible = useStore((state) => state.toggleIsSearchVisible)
  const isVersionHistoryVisible = useStore((state) => state.isVersionHistoryVisible)
  const toggleIsVersionHistoryVisible = useStore((state) => state.toggleIsVersionHistoryVisible)


  return (
    <ButtonGroup
      orientation='horizontal'
      variant='contained'
      sx={{'& > *:not(:last-of-type)': {mr: .6}}}
    >
      <OpenModelControl navigate={navigate}/>
      <SaveModelControl navigate={navigate}/>
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
        dataTestId='Navigation'
        aboutInfo={false}
        selected={isNavigationVisible}
        onClick={() => {
          if (isVersionHistoryVisible) {
            toggleIsVersionHistoryVisible()
            toggleIsNavigationVisible()
          } else {
            toggleIsNavigationVisible()
          }
        }}
      />
      {isRepoActive &&
        <TooltipIconButton
          title='Project History'
          icon={<HistoryIcon className='icon-share' color='secondary'/>}
          placement='bottom'
          selected={isVersionHistoryVisible}
          onClick={() => {
            if (isNavigationVisible) {
              toggleIsVersionHistoryVisible()
              toggleIsNavigationVisible()
            } else {
              toggleIsVersionHistoryVisible()
            }
          }}
        />
      }

    </ButtonGroup>
  )
}
