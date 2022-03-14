import React, {useContext} from 'react'
import {makeStyles, useTheme} from '@mui/styles'
import {ColorModeContext} from '../Share'
import {TooltipIconButton} from './Buttons'
import LogoIcon from '../assets/2D_Icons/Logo.svg'


/**
 * @param {function} onClick function triggered when logo is cliked
 * @return {Object} React component
 */
export default function Logo({onClick}) {
  const classes = useStyles(useTheme())
  const theme = useContext(ColorModeContext)
  return (
    <div className={classes.logoGroup}>
      <LogoIcon onClick={onClick}/>
      <TooltipIconButton
        title={`Change theme from ${theme.isDay() ? 'Day' : 'Night'}` +
               ` to ${theme.isDay() ? 'Night' : 'Day'}`}
        onClick={() => theme.toggleColorMode()}
        icon={theme.isDay() ? '☼' : '☽'}>
      </TooltipIconButton>
    </div>
  )
}


const useStyles = makeStyles((theme) => ({
  logoGroup: {
    'position': 'fixed',
    'bottom': 0,
    'left': 0,
    'margin': '0 0 30px 33px',
    'height': '50px',
    'cursor': 'pointer',
    '@media (max-width: 900px)': {
      position: 'fixed',
      bottom: 0,
      left: 0,
      width: '120px',
    },
    '& svg': {
      'width': '140px',
      '@media (max-width: 350px)': {
        display: 'none',
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
    '& button': {
      position: 'relative',
      top: '-5em',
      left: '-0.5em',
      fontSize: '1.5em',
    },
  },
}))
