import React from 'react'
import Box from '@mui/material/Box'
import {TooltipIconButton} from './Buttons'
import FilePathIcon from '../assets/icons/Clear.svg'
import BranchIcon from '../assets/icons/BranchIcon.svg'


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
        justifyContent: 'space-between',
        opacity: .5,
        height: '260px',
      }}
    >
      <TooltipIconButton
        title={'GitHub Model Path'}
        onClick={() => console.log('show')}
        icon={<FilePathIcon/>}
        placement={'right'}
        dataTestId='open-ifc'
      />
      <TooltipIconButton
        title={'Project Version '}
        onClick={() => console.log('show')}
        icon={<BranchIcon/>}
        placement={'right'}
        dataTestId='open-ifc'
      />
    </Box>
  )
}

