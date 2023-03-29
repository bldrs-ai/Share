import React from 'react'
import Box from '@mui/material/Box'
import {TooltipIconButton} from './Buttons'
import FilePathIcon from '../assets/icons/FilePath.svg'
import BranchIcon from '../assets/icons/Branch.svg'
import TreeIcon from '../assets/icons/Tree.svg'


/**
 * Controls group contains toggles for fileapth, brnaches, spatial navigation, and element type navigation
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.Component}
 */
export default function ControlsGroup() {
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
      <Box
        sx={{
          paddingBottom: '10px',
        }}
      >
        <TooltipIconButton
          title={'GitHub Model Path'}
          onClick={() => console.log('show')}
          icon={<FilePathIcon/>}
          placement={'right'}
          dataTestId='open-ifc'
        />
      </Box>
      <Box
        sx={{
          paddingBottom: '10px',
        }}
      >
        <TooltipIconButton
          title={'Project Version '}
          onClick={() => console.log('show')}
          icon={<BranchIcon/>}
          placement={'right'}
          dataTestId='open-ifc'
        />
      </Box>
      <Box
        sx={{
          paddingBottom: '10px',
        }}
      >
        <TooltipIconButton
          title={'Tree'}
          onClick={() => console.log('show')}
          icon={<TreeIcon/>}
          placement={'right'}
          dataTestId='open-ifc'
        />
      </Box>
    </Box>
  )
}

