import React from 'react'
import {useNavigate} from 'react-router-dom'
import Box from '@mui/material/Box'
import ControlsGroup from '../Components/ControlsGroup'
import {useWindowDimensions} from '../Components/Hooks'
import useStore from '../store/useStore'
import ViewerContainer from './ViewerContainer'


/** @return {React.ReactElement} */
export default function ModelGroup() {

  // IFCSlice
  const model = useStore((state) => state.model)
  const rootElement = useStore((state) => state.rootElement)

  // RepositorySlice
  const modelPath = useStore((state) => state.modelPath)

  // NavTreeSlice
  const isNavTreeEnabled = useStore((state) => state.isNavTreeEnabled)
  const isNavTreeVisible = useStore((state) => state.isNavTreeVisible)

  // VersionsSlice
  const isVersionsEnabled = useStore((state) => state.isVersionsEnabled)
  const isVersionsVisible = useStore((state) => state.isVersionsVisible)

  const navigate = useNavigate()

  const windowDimensions = useWindowDimensions()
  const spacingBetweenSearchAndOpsGroupPx = 20
  const operationsGroupWidthPx = 100
  const searchAndNavWidthPx =
    windowDimensions.width - (operationsGroupWidthPx + spacingBetweenSearchAndOpsGroupPx)
  const searchAndNavMaxWidthPx = 300

  console.log(`nav enabled: ${isNavTreeEnabled}, nav visible: ${isNavTreeVisible}, model: ${model}, root: ${rootElement}`)

  return (
    <Box
      sx={{
        'position': 'absolute',
        'top': `1em`,
        'left': '1em',
        'display': 'flex',
        'flexDirection': 'column',
        'justifyContent': 'flex-start',
        'alignItems': 'flex-start',
        'maxHeight': '95%',
        'width': '275px',
        '@media (max-width: 900px)': {
          width: `${searchAndNavWidthPx}px`,
          maxWidth: `${searchAndNavMaxWidthPx}px`,
        },
      }}
    >
      <ViewerContainer/>

      <ControlsGroup
        navigate={navigate}
        isRepoActive={modelPath.repo !== undefined}
      />

      <Box sx={{marginTop: '.82em', width: '100%'}}>
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
         />}

        {isVersionsEnabled &&
         modelPath.repo !== undefined &&
         isVersionsVisible &&
         !isNavTreeVisible &&
         <VersionsPanel
           filePath={modelPath.filepath}
           currentRef={branch}
         />}
      </Box>
    </Box>
  )
}
