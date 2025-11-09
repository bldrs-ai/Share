import React, {ReactElement} from 'react'
import {Box, Paper} from '@mui/material'
import {assertDefined} from '../../utils/assert'
import {useIsMobile} from '../Hooks'
import PanelTitle, {PANEL_TITLE_HEIGHT} from './PanelTitle'


/**
 * A panel component with a sticky header containing a title and close button
 *
 * @property {string|ReactElement} title The title to display in the panel header
 * @property {Function} onClose A callback to be executed when the close button is clicked
 * @property {ReactElement} children Enclosed elements
 * @property {ReactElement} [actions] Actions component, for the top bar
 * @property {string} [data-testid] Set on the root Paper element
 * @return {ReactElement}
 */
export default function Panel({title, onClose, children, actions = null, ...props}) {
  assertDefined(title, onClose, children)
  const isMobile = useIsMobile()
  return (
    <Box
      sx={{height: '100%', overflow: 'hidden'}}
      data-testid={props['data-testid'] || `PanelBox-${title}`}
      role='region'
      {...props}
    >
      <PanelTitle
        title={title}
        onClose={onClose}
        actions={actions}
      />
      <Paper
        elevation={1}
        sx={{
          padding: '0.5em',
          // This ensures the overflowY scroll for the content doesn't underflow this title.
          height: `calc(100% - ${PANEL_TITLE_HEIGHT})`,
          overflow: 'auto',
          ...(isMobile ? {
            borderRadius: 0,
          } : {}),
        }}
        data-testid={`SideDrawerPanel-Paper-${title}`}
      >
        {children}
      </Paper>
    </Box>
  )
}
