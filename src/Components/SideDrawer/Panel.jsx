import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import {assertDefined} from '../../utils/assert'
import {CloseButton} from '../Buttons'
import {useIsMobile} from '../Hooks'


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
  return (
    <Box sx={{height: '100%', overflow: 'hidden'}} {...props}>
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
          height: `calc(100% - ${TITLE_HEIGHT})`,
          overflow: 'auto',
        }}
        data-testid={'PanelPaper'}
      >
        {children}
      </Paper>
    </Box>
  )
}


/**
 * @property {string} title Panel title
 * @property {Function} onClose Callback for close
 * @property {object} [actions] Actions component placed to the right of the title
 * @return {ReactElement}
 */
function PanelTitle({title, onClose, actions}) {
  assertDefined(title, onClose)
  const isMobile = useIsMobile()
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: TITLE_HEIGHT,
        // These keep the title from scrolling up
        position: 'sticky',
        top: 0,
        zIndex: 1,
      }}
      data-testid='PanelTitle'
    >
      <Typography variant='h2'>{title}</Typography>
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


const TITLE_HEIGHT = '60px'
