import React from 'react'
import Paper from '@mui/material/Paper'
import useTheme from '@mui/styles/useTheme'
import {TooltipIconButton} from './Buttons'
import LogoIcon from '../assets/LogoB.svg'
import PkgJson from '../../package.json'


/**
 * @param {Function} onClick function triggered when logo is clicked
 * @return {React.ReactElement}
 */
export default function Logo({onClick}) {
  const theme = useTheme()

  return (
    <Paper
      variant='control'
      sx={{
        'position': 'fixed',
        'bottom': '1em',
        'left': '1.3em',
        // 'border': `1px solid ${theme.palette.mode === 'light' ? theme.palette.background.control : theme.palette.primary.main } `,
        '& svg': {
          'width': '50px',
          'height': '50px',
          'marginBottom': '4px',
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
      <TooltipIconButton
        title={`Bldrs: ${PkgJson.version}`}
        icon={<LogoIcon style={{marginLeft: '2px'}}/>}
        onClick={() => {
          onClick()
        }}
      />
    </Paper>
  )
}
