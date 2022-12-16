import React from 'react'
import LogoIcon from '../assets/LogoB_4.svg'
import PkgJson from '../../package.json'
import {Box, Tooltip, IconButton} from '@mui/material'

/**
 * @param {Function} onClick function triggered when logo is clicked
 * @return {object} React component
 */
export default function Logo({onClick}) {
  return (
    <Box
      sx={(theme) => ({
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
      })}
    >
      <Tooltip
        title={`Bldrs: ${PkgJson.version}`}
        describeChild
        placement="right"
      >
        <IconButton disableRipple onClick={onClick}>
          <LogoIcon />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
