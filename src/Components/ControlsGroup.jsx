import React from 'react'
import Box from '@mui/material/Box'
import {TooltipIconButton} from './Buttons'
import {useIsMobile} from './Hooks'
import useStore from '../store/useStore'
import BranchIcon from '../assets/icons/Branch.svg'
import TreeIcon from '../assets/icons/Tree.svg'


/**
 * Controls group contains toggles for fileapth, brnaches, spatial navigation, and element type navigation
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.Component}
 */
export default function ControlsGroup({modelPath}) {
  const isTreeVisible = useStore((state) => state.isTreeVisible)
  const isBranchControlVisible = useStore((state) => state.isBranchControlVisible)
  const toggleIsTreeVisible = useStore((state) => state.toggleIsTreeVisible)
  const toggleIsBranchControlVisible = useStore((state) => state.toggleIsBranchControlVisible)
  const isMobile = useIsMobile()

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        opacity: .5,
        marginTop: '14px',
        marginLeft: '5px',
      }}
    >
      {modelPath.repo !== undefined &&
        <Box
          sx={{
            paddingBottom: '13px',
          }}
        >
          <TooltipIconButton
            title={'Project Version '}
            onClick={toggleIsBranchControlVisible}
            selected={!isMobile && isBranchControlVisible}
            icon={<BranchIcon/>}
            placement={'right'}
            dataTestId='open-ifc'
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
          selected={!isMobile && isTreeVisible}
          icon={<TreeIcon/>}
          placement={'right'}
          dataTestId='open-ifc'
        />
      </Box>
    </Box>
  )
}

