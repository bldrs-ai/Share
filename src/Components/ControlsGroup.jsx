import React, {ReactElement} from 'react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import ButtonGroup from '@mui/material/ButtonGroup'
import NavTreeControl from './NavTree/NavTreeControl'
import OpenModelControl from './Open/OpenModelControl'
import SaveModelControl from './Open/SaveModelControl'
import SearchControl from './Search/SearchControl'
import VersionsControl from './Versions/VersionsControl'
import useStore from '../store/useStore'


/**
 * Contains OpenModelControl, Navigate, Versions and Save
 *
 * @property {Function} isRepoActive deselects currently selected element
 * @return {ReactElement}
 */
export default function ControlsGroup({isRepoActive}) {
  const isNavTreeEnabled = useStore((state) => state.isNavTreeEnabled)
  const isOpenEnabled = useStore((state) => state.isOpenEnabled)
  const isSearchEnabled = useStore((state) => state.isSearchEnabled)
  const {isAuthenticated} = useAuth0()
  return (
    <ButtonGroup orientation='horizontal' variant='controls'>
      {isOpenEnabled &&
       <>
         <OpenModelControl/>
         {isAuthenticated && <SaveModelControl/>}
       </>}
      {isNavTreeEnabled && <NavTreeControl/>}
      {isRepoActive && <VersionsControl/>}
      {isSearchEnabled && <SearchControl/>}
    </ButtonGroup>
  )
}
