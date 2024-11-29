import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import {assertDefined} from '../../utils/assert'
// import {useIsMobile} from '../Hooks'
import PanelTitle from './PanelTitle'


/**
 * @property {string} title Panel title
 * @property {ReactElement} children Panel content
 * @property {ReactElement} [controlsGroup] Controls in title bar
 * @property {string} [iconSrc] url to an image to be used to prepend and icon to the title
 * @return {ReactElement}
 */
export default function PanelWithTitle({title, children, controlsGroup, iconSrc, ...props}) {
  assertDefined(title, children)
  const titleHeight = '70px'
  // This isn't visible, but the alignment is important for debugging, so leaving.
  // const isMobile = useIsMobile()
  return (
    <Box sx={{height: '100%', overflow: 'hidden'}} data-test-id='PanelWithTitle' {...props}>
      <PanelTitle
        title={title}
        iconSrc={iconSrc}
        controlsGroup={controlsGroup}
        data-test-id='PanelTitle'
      />
      <Box
        sx={{
          height: `calc(100% - ${titleHeight})`,
          overflow: 'auto',
          padding: '0 1em 0 0', // isMobile ? '0 0.5em 0 0' : '0 0.5em 0 0',
        }}
        data-test-id='PanelWithTitlePanel'
      >
        {children}
      </Box>
    </Box>
  )
}
