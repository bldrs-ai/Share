import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import useStore from '../store/useStore'
import NavTreePanel from '../Components/NavTree/NavTreePanel'
import VersionsPanel from '../Components/Versions/VersionsPanel'
import SideDrawer from '../Components/SideDrawer/SideDrawer'


/**
 * Drawer for NavTree and Versions
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

  const leftDrawerWidth = useStore((state) => state.leftDrawerWidth)
  const leftDrawerWidthInitial = useStore((state) => state.leftDrawerWidthInitial)
  const setLeftDrawerWidth = useStore((state) => state.setLeftDrawerWidth)

  return (
    <SideDrawer
      isDrawerVisible={isDrawerVisible}
      drawerWidth={leftDrawerWidth}
      drawerWidthInitial={leftDrawerWidthInitial}
      setDrawerWidth={setLeftDrawerWidth}
      isResizeOnLeft={false}
      dataTestId='NavTreeAndVersionsDrawer'
    >
      <Box
        sx={{
          display: isNavTreeVisible ? 'block' : 'none',
          height: isVersionsVisible ? `50%` : '100%',
          overflowX: 'hidden',
          overflowY: 'auto',
        }}
        data-testid='NavTreeContainer'
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
      <Box
        sx={{
          display: isVersionsVisible ? 'block' : 'none',
          height: isNavTreeVisible ? `50%` : '100%',
        }}
        data-testid='VersionsContainer'
      >
        {isVersionsEnabled &&
         (modelPath.repo !== undefined) &&
         isVersionsVisible &&
         <VersionsPanel filePath={modelPath.filepath} currentRef={branch}/>}
      </Box>
    </SideDrawer>
  )
}
