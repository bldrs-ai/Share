import React from 'react'
import {useTheme} from '@mui/styles'
import Box from '@mui/material/Box'
import LogoIcon from '../assets/LogoB_5.svg'


/**
 * @return {React.ReactElement}
 */
export default function Logo() {
  const theme = useTheme()
  return (
    <Box
      sx={{
        '& svg': {
          'width': '50px',
          'height': '50px',
          'marginBottom': '-4px',
          'marginTop': '4px',
          '@media (max-width: 900px)': {
            width: '40px',
          },
          '& .left-face': {
            fill: theme.palette.secondary.background,
          },
          '& .right-face': {
            fill: theme.palette.secondary.main,
          },
          '& #logo path': {
            stroke: theme.palette.primary.main,
          },
        },
      }}
    >
      <LogoIcon/>
    </Box>
  )
}
