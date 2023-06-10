import React from 'react'
import Paper from '@mui/material/Paper'
import {TooltipIconButton} from './Buttons'
// import SaveModelControl from './SaveModelControl'
// import useStore from '../store/useStore'
// import BranchIcon from '../assets/icons/Branch.svg'
// import SearchIcon from '../assets/icons/Search.svg'
// import OpenModelControl from './OpenModelControl'
// import StructureMenu from '../Components/StructureMenu'
// import TreeMenu from './TreeMenu'
import CutPlaneMenu from './CutPlaneMenu'
import ExtractLevelsMenu from './ExtractLevelsMenu'
import StandardViewsMenu from './StandardViewsMenu'
import CaptureIcon from '../assets/icons/Capture.svg'


/**
 * Controls group contains toggles for fileapth, branches, spatial navigation, and element type navigation
 *
 * @param {Function} modelPath object containing information about the location of the model
 * @return {React.Component}
 */
export default function ViewGroup({modelPath, isLocalModel, fileOpen}) {
  // const isBranches = useStore((state) => state.isBranches)
  // const isBranchControlVisible = useStore((state) => state.isBranchControlVisible)
  // const toggleIsBranchControlVisible = useStore((state) => state.toggleIsBranchControlVisible)
  // const isSearchBarVisible = useStore((state) => state.isSearchBarVisible)
  // const toggleIsSearchBarVisible = useStore((state) => state.toggleIsSearchBarVisible)

  return (
    <Paper
      elevation={1}
      variant='control'
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'flex-start',
        marginLeft: '5px',
        borderRadius: '10px',
        opacity: .9,
      }}
    >
      <StandardViewsMenu/>
      <ExtractLevelsMenu/>
      <CutPlaneMenu/>
      <TooltipIconButton
        title={'Capture View'}
        placement={'top'}
        icon={<CaptureIcon/>}
        onClick={''}
      />
    </Paper>
  )
}
