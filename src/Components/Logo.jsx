import React, {useContext, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {makeStyles, useTheme} from '@mui/styles'
import {ColorModeContext, navToDefault} from '../Share'
import {TooltipIconButton} from './Buttons'
import LogoIcon from '../assets/2D_Icons/Logo.svg'


/**
 * @param {string} appPrefix
 * @return {Object} React component
 */
export default function Logo({appPrefix}) {
  const [isControlDisplayed, setIsControlDisplayed] = useState(false)
  const classes = useStyles(useTheme())
  const theme = useContext(ColorModeContext)
  const navigate = useNavigate()

  return (
    <div className={classes.logoGroup}>
      <LogoIcon
        onClick={() => setIsControlDisplayed(!isControlDisplayed)}
        onDoubleClick={() => navToDefault(navigate, appPrefix)}
      />
      <div
        style={{display: isControlDisplayed ? 'inherit' : 'none'}}>
        <TooltipIconButton
          title={`Change theme from ${theme.isDay() ? 'Day' : 'Night'}` +
                 ` to ${theme.isDay() ? 'Night' : 'Day'}`}
          onClick={() => theme.toggleColorMode()}
          icon={theme.isDay() ? '☼' : '☽'}>
        </TooltipIconButton>
      </div>
    </div>
  )
}


const useStyles = makeStyles((theme) => ({
  logoGroup: {
    'position': 'fixed',
    'bottom': 0,
    'left': 0,
    'margin': '0 0 20px 20px',
    'height': '50px',
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
      fontSize: '1.5em',
    },
  },
}))
