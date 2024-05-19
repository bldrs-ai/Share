import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import {assertDefined} from '../../utils/assert'
import {useIsMobile} from '../Hooks'
import PanelTitle from './PanelTitle'


/**
 * @property {string} title Panel title
 * @property {ReactElement} children Panel content
 * @property {ReactElement} [controlsGroup] Controls in title bar
 * @property {string} [iconSrc] url to an image to be used to prepend and icon to the title
 * @return {ReactElement}
 */
export default function PanelWithTitle({title, children, controlsGroup, iconSrc}) {
  assertDefined(title, children)
  const titleHeight = '2.8em'
  // This isn't visible, but the alignment is important for debugging, so leaving.
  const isMobile = useIsMobile()

  return (
    <Box
      sx={{height: '100%', overflow: 'hidden'}}
      data-testid={`side-drawer-panel-${title.toLowerCase()}`}
    >
      <PanelTitle
        title={title}
        iconSrc={iconSrc}
        controlsGroup={controlsGroup}
      />
      <Box
        sx={{
          height: `calc(100% - ${titleHeight})`,
          overflow: 'auto',
          padding: isMobile ? '0 0.5em 0 0' : '0em 0.5em 1em 0',
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
