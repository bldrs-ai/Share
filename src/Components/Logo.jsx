import React from 'react'
import {useTheme} from '@mui/styles'
import Box from '@mui/material/Box'
import LogoIcon from '../assets/LogoB.svg'


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
          '@media (max-width: 900px)': {
            width: '40px',
          },
          '& .left-face': {
            fill: theme.palette.primary.main,
          },
          '& .right-face': {
            fill: theme.palette.background.secondary,
          },
          '& #logo path': {
            stroke: theme.palette.primary.contrastText,
          },
        },
      }}
    >
      <LogoIcon/>
    </Box>
  )
}
