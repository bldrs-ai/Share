import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
import ButtonGroup from '@mui/material/ButtonGroup'
import NavTreeControl from './NavTree/NavTreeControl'
import OpenModelControl from './Open/OpenModelControl'
import SaveModelControl from './Open/SaveModelControl'
import VersionsControl from './Versions/VersionsControl'


/**
 * Contains OpenModelControl, Navigate, Versions and Save
 *
 * @property {Function} isRepoActive deselects currently selected element
 * @return {React.ReactElement}
 */
export default function ControlsGroup({isRepoActive}) {
  const {isAuthenticated} = useAuth0()
  return (
    <ButtonGroup orientation='horizontal' variant='controls'>
      <OpenModelControl/>
      {isAuthenticated && <SaveModelControl/>}
      <NavTreeControl/>
      {isRepoActive && <VersionsControl/>}
    </ButtonGroup>
  )
}
