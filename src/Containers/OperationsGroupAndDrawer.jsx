import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import {useIsMobile} from '../Components/Hooks'
import AppsSideDrawer from './AppsSideDrawer'
import NotesAndProperties from './NotesAndProperties'
import OperationsGroup from './OperationsGroup'


/**
 * @property {Function} deselectItems deselects currently selected element
 * @return {ReactElement}
 */
export default function OperationsGroupAndDrawer({deselectItems}) {
  const isMobile = useIsMobile()
  return (
    isMobile ? (
      <>
        {/* TODO(pablo): line 650 : CadView just has two sub-components the left and right group,
        and their first elements should be same height and offset so they line up naturally..
        this is a shim for the misalignment you see with tooltips without it */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
          }}
        >
          <OperationsGroup deselectItems={deselectItems}/>
        </Box>
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            width: '100%',
          }}
        >
          <NotesAndProperties/>
        </Box>
      </>
    ) : (
      <Stack direction='row' sx={{pointerEvents: 'none'}}>
        <OperationsGroup deselectItems={deselectItems}/>
        <Stack direction='row' style={{pointerEvents: 'auto'}}>
          <NotesAndProperties/>
          <AppsSideDrawer/>
        </Stack>
      </Stack>
    )
  )
}
