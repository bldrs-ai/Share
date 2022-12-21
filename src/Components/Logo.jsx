import React from 'react'
import {Box, IconButton, Tooltip} from '@mui/material'
import {useTheme} from '@mui/styles'
import LogoIcon from '../assets/LogoB_4.svg'
import PkgJson from '../../package.json'


/**
 * @param {Function} onClick function triggered when logo is cliked
 * @return {object} React component
 */
export default function Logo({onClick}) {
  const theme = useTheme()


  return (
    <Box sx={{
      'position': 'fixed',
      'bottom': '-60px',
      'left': '12px',
      '& svg': {
        'width': '50px',
        '@media (max-width: 900px)': {
          width: '50px',
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
      <Tooltip title={`Bldrs: ${PkgJson.version}`} describeChild placement="right">
        <IconButton disableRipple onClick={onClick}>
          <LogoIcon/>
        </IconButton>
      </Tooltip>
    </Box>
  )
}
