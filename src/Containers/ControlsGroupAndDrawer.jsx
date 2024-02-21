import React from 'react'
import {useNavigate} from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import ControlsGroup from '../Components/ControlsGroup'
import {useWindowDimensions} from '../Components/Hooks'
import NavTreePanel from '../Components/NavTree/NavTreePanel'
// TODO(pablo): make left side drawer
// import SideDrawer from '../Components/SideDrawer/SideDrawer'
import VersionsPanel from '../Components/Versions/VersionsPanel'
import useStore from '../store/useStore'


/**
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.ReactElement}
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
  const isVersionsEnabled = useStore((state) => state.isVersionsEnabled)
  const isVersionsVisible = useStore((state) => state.isVersionsVisible)

  const navigate = useNavigate()

  const windowDimensions = useWindowDimensions()
  const spacingBetweenSearchAndOpsGroupPx = 20
  const operationsGroupWidthPx = 100
  const searchAndNavWidthPx =
    windowDimensions.width - (operationsGroupWidthPx + spacingBetweenSearchAndOpsGroupPx)
  const searchAndNavMaxWidthPx = 300

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

      <Box sx={{width: '100%', margin: '1em'}}>
        {isNavTreeEnabled &&
         isNavTreeVisible &&
         model &&
         rootElement &&
         <NavTreePanel
           model={model}
           selectWithShiftClickEvents={selectWithShiftClickEvents}
           pathPrefix={
             pathPrefix + (modelPath.gitpath ? modelPath.getRepoPath() : modelPath.filepath)
           }
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
