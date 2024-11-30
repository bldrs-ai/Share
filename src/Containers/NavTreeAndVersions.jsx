import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import {useTheme} from '@mui/material/styles'
import useStore from '../store/useStore'
import NavTreePanel from '../Components/NavTree/NavTreePanel'
import VersionsPanel from '../Components/Versions/VersionsPanel'
import SideDrawer from '../Components/SideDrawer/SideDrawer'
import {hexToRgba} from '../utils/color'


/**
 * Container for NavTree and Versions
 *
 * @return {ReactElement}
 */
export default function({
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
  const isDrawerVisible = isNavTreeVisible === true || isVersionsVisible === true
  const isDividerVisible = isNavTreeVisible && isVersionsVisible

  const leftDrawerWidth = useStore((state) => state.leftDrawerWidth)
  const leftDrawerWidthInitial = useStore((state) => state.leftDrawerWidthInitial)
  const setLeftDrawerWidth = useStore((state) => state.setLeftDrawerWidth)

  const theme = useTheme()
  const borderOpacity = 0.5
  const borderColor = hexToRgba(theme.palette.secondary.contrastText, borderOpacity)
  return (
    <SideDrawer
      isDrawerVisible={isDrawerVisible}
      drawerWidth={leftDrawerWidth}
      drawerWidthInitial={leftDrawerWidthInitial}
      setDrawerWidth={setLeftDrawerWidth}
      isResizeOnLeft={false}
      dataTestId='LeftDrawer'
    >
      <Box
        sx={{
          display: isNavTreeVisible ? 'block' : 'none',
          height: isVersionsVisible ? `50%` : '100%',
          overflowX: 'hidden',
          overflowY: 'auto',
        }}
        data-testid='NavTreeAndVersions'
      >
        {isNavTreeEnabled &&
         isNavTreeVisible &&
         model &&
         rootElement &&
         <NavTreePanel
           model={model}
           pathPrefix={
             pathPrefix + (
               modelPath.gitpath ?
                 modelPath.getRepoPath() :
                 modelPath.filepath
             )
           }
           selectWithShiftClickEvents={selectWithShiftClickEvents}
         />}
      </Box>
      {isDividerVisible && <Divider sx={{borderColor: borderColor}}/>}
      <Box
        sx={{
          display: isVersionsVisible ? 'block' : 'none',
          height: isNavTreeVisible ? `50%` : '100%',
        }}
      >
        {isVersionsEnabled &&
         (modelPath.repo !== undefined) &&
         isVersionsVisible &&
         <VersionsPanel filePath={modelPath.filepath} currentRef={branch}/>}
      </Box>
    </SideDrawer>
  )
}
