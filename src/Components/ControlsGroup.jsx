import React from 'react'
import Paper from '@mui/material/Paper'
import {TooltipIconButton} from './Buttons'
import SaveModelControl from './SaveModelControl'
import useStore from '../store/useStore'
// import BranchIcon from '../assets/icons/Branch.svg'
import SearchIcon from '../assets/icons/Search.svg'
import OpenModelControl from '../Components/OpenModelControl'
// import StructureMenu from '../Components/StructureMenu'
import TreeMenu from './TreeMenu'


/**
 * Controls group contains toggles for fileapth, branches, spatial navigation, and element type navigation
 *
 * @param {Function} modelPath object containing information about the location of the model
 * @return {React.Component}
 */
export default function ControlsGroup({modelPath, isLocalModel, fileOpen}) {
  // const isBranches = useStore((state) => state.isBranches)
  // const isBranchControlVisible = useStore((state) => state.isBranchControlVisible)
  // const toggleIsBranchControlVisible = useStore((state) => state.toggleIsBranchControlVisible)
  const isSearchBarVisible = useStore((state) => state.isSearchBarVisible)
  const toggleIsSearchBarVisible = useStore((state) => state.toggleIsSearchBarVisible)

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
      <OpenModelControl modelPath={modelPath} fileOpen={fileOpen} isLocalModel={isLocalModel}/>
      {isLocalModel &&
          <SaveModelControl modelPath={modelPath}/>
      }
      <TooltipIconButton
        title={'Search'}
        onClick={toggleIsSearchBarVisible}
        selected={isSearchBarVisible}
        icon={<SearchIcon/>}
        placement={'bottom'}
        dataTestId='spatial-elements'
      />
      {/* {isBranches &&
        <TooltipIconButton
          title={'Versions'}
          onClick={toggleIsBranchControlVisible}
          selected={isBranchControlVisible}
          icon={<BranchIcon/>}
          placement={'bottom'}
          dataTestId='project-version'
        />
      } */}
      <TreeMenu/>
      {/* <StructureMenu/> */}
    </Paper>
  )
}