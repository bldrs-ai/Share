import React, {ReactElement, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import ControlsGroup from '../Components/ControlsGroup'
import {useWindowDimensions} from '../Components/Hooks'
import NavTreePanel from '../Components/NavTree/NavTreePanel'
import SearchBar from '../Components/Search/SearchBar'
import VersionsPanel from '../Components/Versions/VersionsPanel'
import useStore from '../store/useStore'


/**
 * @property {Function} deselectItems deselects currently selected element
 * @return {ReactElement}
 */
export default function ControlsGroupAndDrawer({
  deselectItems,
  pathPrefix,
  branch,
  selectWithShiftClickEvents,
}) {
  // IFCSlice
  const model = useStore((state) => state.model)
  const rootElement = useStore((state) => state.rootElement)

  // RepositorySlice
  const modelPath = useStore((state) => state.modelPath)

  // Slices from Controls
  const isNavTreeEnabled = useStore((state) => state.isNavTreeEnabled)
  const isNavTreeVisible = useStore((state) => state.isNavTreeVisible)
  const setIsNavTreeVisible = useStore((state) => state.setIsNavTreeVisible)

  const isVersionsEnabled = useStore((state) => state.isVersionsEnabled)
  const isVersionsVisible = useStore((state) => state.isVersionsVisible)
  const setIsVersionsVisible = useStore((state) => state.setIsVersionsVisible)

  // SearchSlice
  const isSearchEnabled = useStore((state) => state.isSearchEnabled)
  const isSearchBarVisible = useStore((state) => state.isSearchBarVisible)

  const navigate = useNavigate()

  const windowDimensions = useWindowDimensions()
  const spacingBetweenSearchAndOpsGroupPx = 20
  const operationsGroupWidthPx = 70
  const searchAndNavWidthPx =
    windowDimensions.width - (operationsGroupWidthPx + spacingBetweenSearchAndOpsGroupPx)
  const searchAndNavMaxWidthPx = 300


  useEffect(() => {
    if (isNavTreeVisible && isVersionsVisible) {
      setIsVersionsVisible(false)
    }
  }, [isNavTreeVisible, isVersionsVisible, setIsVersionsVisible])


  useEffect(() => {
    if (isNavTreeVisible && isVersionsVisible) {
      setIsNavTreeVisible(false)
    }
  }, [isNavTreeVisible, isVersionsVisible, setIsNavTreeVisible])


  return (
    <Stack
      justifyContent='flex-start'
      alignItems='flex-start'
      sx={{
        'height': '100vh',
        // Same as src/store/SideDrawerSlice.jsx#sidebarWidth
        'width': '350px',
        '@media (max-width: 900px)': {
          width: `${searchAndNavWidthPx}px`,
          maxWidth: `${searchAndNavMaxWidthPx}px`,
        },
      }}
    >
      <ControlsGroup
        navigate={navigate}
        isRepoActive={modelPath.repo !== undefined}
      />

      <Box sx={{width: '100%'}}>
        {isSearchEnabled && isSearchBarVisible && <SearchBar placeholder='Search'/>}
        {isNavTreeEnabled &&
         isNavTreeVisible &&
         model &&
         rootElement &&
         <NavTreePanel
           model={model}
           pathPrefix={
             pathPrefix + (modelPath.gitpath ? modelPath.getRepoPath() : modelPath.filepath)
           }
           selectWithShiftClickEvents={selectWithShiftClickEvents}
         />
        }

        {isVersionsEnabled &&
         modelPath.repo !== undefined &&
         isVersionsVisible &&
         !isNavTreeVisible &&
         <VersionsPanel
           filePath={modelPath.filepath}
           currentRef={branch}
         />}
      </Box>
    </Stack>
  )
}
