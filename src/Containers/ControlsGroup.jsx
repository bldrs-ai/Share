import React, {ReactElement} from 'react'
import Stack from '@mui/material/Stack'
import {useAuth0} from '../Auth0/Auth0Proxy'
import NavTreeControl from '../Components/NavTree/NavTreeControl'
import OpenModelControl from '../Components/Open/OpenModelControl'
import SaveModelControl from '../Components/Open/SaveModelControl'
import SearchBar from '../Components/Search/SearchBar'
import SearchControl from '../Components/Search/SearchControl'
import VersionsControl from '../Components/Versions/VersionsControl'
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
  const {isAuthenticated} = useAuth0()
  return (
    <Stack>
      <Stack direction='row'>
        {isOpenEnabled &&
         <>
           <OpenModelControl/>
           {isAuthenticated && <SaveModelControl/>}
         </>}
        {isSearchEnabled && <SearchControl/>}
        {isSearchEnabled &&
         isSearchBarVisible &&
         <SearchBar
           placeholder='Search'
           helperText='Paste GitHub file link to open the model'
           onSuccess={() => setIsSearchBarVisible(false)}
         />}
      </Stack>
      <Stack>
        {isNavTreeEnabled && <NavTreeControl/>}
        {isVersionsEnabled && <VersionsControl/>}
      </Stack>
    </Stack>
  )
}
