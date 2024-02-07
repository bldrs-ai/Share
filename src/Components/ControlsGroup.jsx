import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
import ButtonGroup from '@mui/material/ButtonGroup'
import useStore from '../store/useStore'
import {TooltipIconButton} from './Buttons'
import NavTreeControl from './NavTree/NavTreeControl'
import OpenModelControl from './OpenModelControl'
import SaveModelControl from './SaveModelControl'
import SearchControl from './Search/SearchControl'
import HistoryIcon from '@mui/icons-material/History'


/**
 * Contains OpenModelControl, Search, Navigate, Versions and Save
 *
 * @property {Function} navigate Callback from CadView to change page url
 * @property {Function} isRepoActive deselects currently selected element
 * @return {React.Component}
 */
export default function ControlsGroup({isRepoActive}) {
  const {isAuthenticated} = useAuth0()
  const isNavigationVisible = useStore((state) => state.isNavigationVisible)
  const toggleIsNavigationVisible = useStore((state) => state.toggleIsNavigationVisible)
  const isVersionHistoryVisible = useStore((state) => state.isVersionHistoryVisible)
  const toggleIsVersionHistoryVisible = useStore((state) => state.toggleIsVersionHistoryVisible)

  return (
    <ButtonGroup
      orientation='horizontal'
      variant='contained'
    >
      <OpenModelControl/>

      <SearchControl/>

      {isAuthenticated && <SaveModelControl/>}

      <NavTreeControl/>

      {isRepoActive &&
        <TooltipIconButton
          title='Versions'
          icon={<HistoryIcon className='icon-share'/>}
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
