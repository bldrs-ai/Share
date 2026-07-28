import React, {ReactElement} from 'react'
import {Stack} from '@mui/material'
import {useAuth0} from '../Auth0/Auth0Proxy'
import NavTreeControl from '../Components/NavTree/NavTreeControl'
import OpenModelControl from '../Components/Open/OpenModelControl'
import SaveModelControl from '../Components/Open/SaveModelControl'
import SearchBar from '../Components/Search/SearchBar'
import SearchControl from '../Components/Search/SearchControl'
import VersionsControl from '../Components/Versions/VersionsControl'
import useExistInFeature from '../hooks/useExistInFeature'
import useStore from '../store/useStore'


/**
 * Contains OpenModelControl, Navigate, Versions and Save
 *
 * @return {ReactElement}
 */
export default function ControlsGroup() {
  const isNavTreeEnabled = useStore((state) => state.isNavTreeEnabled)
  const isVersionsEnabled = useStore((state) => state.isVersionsEnabled)
  const isOpenEnabled = useStore((state) => state.isOpenEnabled)
  const isSearchEnabled = useStore((state) => state.isSearchEnabled)
  const isSearchBarVisible = useStore((state) => state.isSearchBarVisible)
  const setIsSearchBarVisible = useStore((state) => state.setIsSearchBarVisible)
  // With the workspace shell on, search lives in the TopBar (#1663) —
  // this over-canvas toggle would be a second entry point to the same
  // query state.
  const isWorkspaceEnabled = useExistInFeature('workspace')
  const {isAuthenticated} = useAuth0()
  return (
    <Stack>
      <Stack direction='row'>
        {isOpenEnabled &&
         <>
           <OpenModelControl/>
           {isAuthenticated && <SaveModelControl/>}
         </>}
        {isSearchEnabled && !isWorkspaceEnabled && <SearchControl/>}
        {isSearchEnabled && !isWorkspaceEnabled &&
         isSearchBarVisible &&
         <SearchBar onSuccess={() => setIsSearchBarVisible(false)}/>}
      </Stack>
      <Stack>
        {isNavTreeEnabled && <NavTreeControl/>}
        {isVersionsEnabled && <VersionsControl/>}
      </Stack>
    </Stack>
  )
}
