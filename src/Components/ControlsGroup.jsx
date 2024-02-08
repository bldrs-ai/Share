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
  const isNavTreeVisible = useStore((state) => state.isNavTreeVisible)
  const toggleIsNavTreeVisible = useStore((state) => state.toggleIsNavTreeVisible)
  const isVersionsVisible = useStore((state) => state.isVersionsVisible)
  const toggleIsVersionsVisible = useStore((state) => state.toggleIsVersionsVisible)

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
          selected={isVersionsVisible}
          onClick={() => {
            toggleIsVersionsVisible()
            if (isNavTreeVisible) {
              toggleIsNavTreeVisible()
            }
          }}
        />
      }

    </ButtonGroup>
  )
}
