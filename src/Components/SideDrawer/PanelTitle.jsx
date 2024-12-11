import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {useTheme} from '@mui/material/styles'
import {assertDefined} from '../../utils/assert'
import {CloseButton} from '../Buttons'
import {useIsMobile} from '../Hooks'


/**
 * @property {string} title Panel title
 * @property {Function} onClose Callback for close
 * @property {object} [actions] Actions component placed to the right of the title
 * @return {ReactElement}
 */
export default function PanelTitle({title, onClose, actions}) {
  assertDefined(title, onClose)
  const isMobile = useIsMobile()
  const theme = useTheme()
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 'fit-content',
        // These keep the title from scrolling up
        position: 'sticky',
        top: 0,
        zIndex: 1,
        ...(isMobile ? {
          justifyContent: 'flex-end',
          backgroundColor: `${theme.palette.secondary.backgroundColor} !important`,
          backdropFilter: `${theme.palette.secondary.backdropFilter} !important`,
        } : {}),
      }}
      data-testid={`PanelTitle-${title}`}
    >
      {!isMobile && <Typography variant='h2'>{title}</Typography>}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {actions}
        {!isMobile && <CloseButton onCloseClick={onClose}/>}
      </Box>
    </Box>
  )
}


export const PANEL_TITLE_HEIGHT = '60px'
