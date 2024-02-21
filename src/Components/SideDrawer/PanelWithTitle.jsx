import React from 'react'
import Box from '@mui/material/Box'
import useTheme from '@mui/styles/useTheme'
import {assertDefined} from '../../utils/assert'
import {hexToRgba} from '../../utils/color'
import {useIsMobile} from '../Hooks'
import PanelTitle from './PanelTitle'


/**
 * @property {string} title Panel title
 * @property {React.ReactElement} children Panel content
 * @property {React.ReactElement} [controlsGroup] Controls in title bar
 * @property {string} [iconSrc] url to an image to be used to prepend and icon to the title
 * @property {boolean} [includeGutter] Below title.  Default: false
 * @return {React.ReactElement}
 */
export default function PanelWithTitle({title, children, controlsGroup, iconSrc, includeGutter}) {
  assertDefined(title, children)
  const titleHeight = '2.8em'
  const theme = useTheme()
  // This isn't visible, but the alignment is important for debugging, so leaving.
  const headerBorderOpacity = 0
  const headerBorderColor = hexToRgba(theme.palette.primary.contrastText, headerBorderOpacity)
  const isMobile = useIsMobile()

  return (
    <Box sx={{height: '100%', overflow: 'hidden'}}>
      <PanelTitle
        title={title}
        iconSrc={iconSrc}
        controlsGroup={controlsGroup}
        includeGutter={includeGutter}
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
