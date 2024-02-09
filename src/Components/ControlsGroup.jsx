import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
import ButtonGroup from '@mui/material/ButtonGroup'
import NavTreeControl from './NavTree/NavTreeControl'
import OpenModelControl from './OpenModelControl'
import SaveModelControl from './SaveModelControl'
import SearchControl from './Search/SearchControl'
import VersionsControl from './Versions/VersionsControl'


/**
 * Contains OpenModelControl, Search, Navigate, Versions and Save
 *
 * @property {Function} isRepoActive deselects currently selected element
 * @return {React.ReactElement}
 */
export default function ControlsGroup({isRepoActive}) {
  const {isAuthenticated} = useAuth0()
  return (
    <ButtonGroup orientation='horizontal' variant='contained'>
      <OpenModelControl/>
      {isAuthenticated && <SaveModelControl/>}
      <SearchControl/>
      <NavTreeControl/>
      {isRepoActive && <VersionsControl/>}
    </ButtonGroup>
  )
}
