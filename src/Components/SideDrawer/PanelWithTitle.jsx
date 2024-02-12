import React from 'react'
import Box from '@mui/material/Box'
import useTheme from '@mui/styles/useTheme'
import {hexToRgba} from '../../utils/color'
import {useIsMobile} from '../Hooks'
import PanelTitle from './PanelTitle'


/**
 * @param {object} props React props with children
 * @return {React.ReactElement}
 */
export default function PanelWithTitle(props) {
  const titleHeight = '2.8em'
  const paddingBottom = '0.6em'
  const theme = useTheme()
  // This isn't visible, but the alignment is important for debugging, so leaving.
  const headerBorderOpacity = 0
  const headerBorderColor = hexToRgba(theme.palette.primary.contrastText, headerBorderOpacity)
  const isMobile = useIsMobile()

  return (
    <Box sx={{height: '100%', overflow: 'hidden'}}>
      <Box
        sx={{
          height: props.includeGutter ?
            `calc(${titleHeight} + ${paddingBottom})` :
            '${titleHeight}',
          borderBottom: `solid 1px ${headerBorderColor}`,
        }}
      >
        <PanelTitle
          title={props.title}
          iconSrc={props.iconSrc}
          controlsGroup={props.controlsGroup}
        />
      </Box>
      <Box
        sx={{
          height: `calc(100% - ${titleHeight})`,
          overflow: 'auto',
          padding: isMobile ? '0 0.5em 0 0' : '0em 0.5em 1em 0',
        }}
      >
        {props.children}
      </Box>
    </Box>
  )
}
