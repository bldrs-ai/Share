import React, {ReactElement} from 'react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import ButtonGroup from '@mui/material/ButtonGroup'
import Stack from '@mui/material/Stack'
import NavTreeControl from './NavTree/NavTreeControl'
import OpenModelControl from './Open/OpenModelControl'
import SaveModelControl from './Open/SaveModelControl'
import SearchControl from './Search/SearchControl'
import VersionsControl from './Versions/VersionsControl'
import useStore from '../store/useStore'


/**
 * Contains OpenModelControl, Navigate, Versions and Save
 *
 * @return {ReactElement}
 */
export default function ControlsGroup() {
  // RepositorySlice
  const modelPath = useStore((state) => state.modelPath)
  const isNavTreeEnabled = useStore((state) => state.isNavTreeEnabled)
  const isVersionsEnabled = useStore((state) => state.isVersionsEnabled)
  const isOpenEnabled = useStore((state) => state.isOpenEnabled)
  const isSearchEnabled = useStore((state) => state.isSearchEnabled)
  const {isAuthenticated} = useAuth0()
  return (
    <Stack direction='column'>
      <ButtonGroup orientation='horizontal' variant='controls'>
        {isOpenEnabled &&
         <>
           <OpenModelControl/>
         {isAuthenticated && <SaveModelControl/>}
         </>}
        {isSearchEnabled && <SearchControl/>}
      </ButtonGroup>
      <Stack>
        {isNavTreeEnabled && <NavTreeControl/>}
        {isVersionsEnabled && <VersionsControl/>}
      </Stack>
    </Stack>
  )
}
