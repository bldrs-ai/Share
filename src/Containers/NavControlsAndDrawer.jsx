import React, {ReactElement} from 'react'
import {useNavigate} from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import ControlsGroup from '../Components/ControlsGroup'
import SearchBar from '../Components/Search/SearchBar'
import NavTreeAndVersions from './NavTreeAndVersions'
import useStore from '../store/useStore'


/**
 * @property {Function} deselectItems deselects currently selected element
 * @return {ReactElement}
 */
export default function NavControlsAndDrawer({
  deselectItems,
  pathPrefix,
  branch,
  selectWithShiftClickEvents,
}) {
  // SearchSlice
  const isSearchEnabled = useStore((state) => state.isSearchEnabled)
  const isSearchBarVisible = useStore((state) => state.isSearchBarVisible)

  const navigate = useNavigate()

  return (
    <Stack direction='row'>
      <NavTreeAndVersions
        pathPrefix={pathPrefix}
        branch={branch}
        selectWithShiftClickEvents={selectWithShiftClickEvents}
      />
      <ControlsGroup navigate={navigate}/>
      <Box sx={{width: '100%'}}>
        {isSearchEnabled &&
         isSearchBarVisible &&
         <SearchBar placeholder='Search' id='search'/>}
      </Box>
    </Stack>
  )
}
