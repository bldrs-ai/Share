import React from 'react'
import Box from '@mui/material/Box'
import {TooltipIconButton} from './Buttons'
import useStore from '../store/useStore'
import BranchIcon from '../assets/icons/Branch.svg'
import TreeIcon from '../assets/icons/Tree.svg'


/**
 * Controls group contains toggles for fileapth, branches, spatial navigation, and element type navigation
 *
 * @param {Function} modelPath object containing information about the location of the model
 * @return {React.Component}
 */
export default function ControlsGroup({modelPath}) {
  const toggleIsTreeVisible = useStore((state) => state.toggleIsTreeVisible)
  const isBranches = useStore((state) => state.isBranches)
  const toggleIsBranchControlVisible = useStore((state) => state.toggleIsBranchControlVisible)
  const isBranchControlVisible = useStore((state) => state.isBranchControlVisible)
  const isTreeVisible = useStore((state) => state.isTreeVisible)


  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        marginTop: '14px',
        marginLeft: '5px',
      }}
    >
      {isBranches &&
        <Box
          sx={{
            paddingBottom: '13px',
          }}
        >
          <TooltipIconButton
            title={'Project Version'}
            onClick={toggleIsBranchControlVisible}
            selected={isBranchControlVisible}
            icon={<BranchIcon/>}
            placement={'right'}
            dataTestId='project-version'
          />
        </Box>
      }
      <Box
        sx={{
          paddingBottom: '13px',
        }}
      >
        <TooltipIconButton
          title={'Hierarchy of spatial elements'}
          onClick={toggleIsTreeVisible}
          selected={isTreeVisible}
          icon={<TreeIcon/>}
          placement={'right'}
          dataTestId='spatial-elements'
        />
      </Box>
    </Box>
  )
}

