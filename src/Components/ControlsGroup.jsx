import React from 'react'
import ButtonGroup from '@mui/material/ButtonGroup'
import HistoryIcon from '@mui/icons-material/History'
import SearchIcon from '@mui/icons-material/Search'
import useStore from '../store/useStore'
import {TooltipIconButton} from './Buttons'
import OpenModelControl from './OpenModelControl'
import TreeIcon from '../assets/icons/Tree.svg'


/**
 * OperationsGroup contains tools for sharing, notes, properties, cut
 * plane, deselect, theme change and about.
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.Component}
 */
export default function OperationsGroup({fileOpen, repo}) {
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
      <OpenModelControl fileOpen={fileOpen}/>
      <TooltipIconButton
        tooltip='Search'
        icon={<SearchIcon className='icon-share' color='secondary'/>}
        placement='bottom'
        isHelpTooltip={false}
        selected={isSearchVisible}
        onClick={toggleIsSearchVisible}
      />
      <TooltipIconButton
        tooltip='Navigation'
        icon={<TreeIcon className='icon-share' color='secondary' style={{width: '17px', height: '17px'}}/>}
        placement='bottom'
        isHelpTooltip={false}
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
      {repo !== undefined &&
        <TooltipIconButton
          tooltip='Project History'
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
