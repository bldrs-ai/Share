import React from 'react'
import Box from '@mui/material/Box'
import {useTheme} from '@mui/styles'
import {TooltipIconButton} from './Buttons'
import LogoIcon from '../assets/LogoB_3.svg'
import PkgJson from '../../package.json'


/**
 * @param {Function} onClick function triggered when logo is cliked
 * @return {object} React component
 */
export default function Logo({onClick}) {
  const theme = useTheme()
  return (
    <Box
      sx={{
        'position': 'fixed',
        'bottom': '20px',
        'left': '20px',
        '& svg': {
          'width': '50px',
          'height': '50px',
          '@media (max-width: 900px)': {
            width: '40px',
          },
          '& .left-face': {
            fill: theme.palette.primary.light,
          },
          '& .right-face': {
            fill: theme.palette.primary.dark,
          },
          '& .edges': {
            stroke: theme.palette.primary.contrastText,
          },
        },
      }}
    >
      <TooltipIconButton
        title={`Bldrs: ${PkgJson.version}`}
        onClick={onClick}
        icon={<LogoIcon/>}
        describeChild
        placement="right"
      />
    </Box>
  )
}
