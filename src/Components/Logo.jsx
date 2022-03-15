import React, {useContext} from 'react'
import {makeStyles, useTheme} from '@mui/styles'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import {ColorModeContext} from '../Share'
import PkgJson from '../../package.json'
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
      <TooltipIconButton
        title={`Change theme from ${theme.isDay() ? 'Day' : 'Night'}` +
               ` to ${theme.isDay() ? 'Night' : 'Day'}`}
        onClick={() => theme.toggleColorMode()}
        icon={theme.isDay() ? '☼' : '☽'}>
      </TooltipIconButton>
      <Tooltip title={`Bldrs: ${PkgJson.version}`} describeChild placement="right">
        <IconButton disableRipple onClick={onClick}><LogoIcon/></IconButton>
      </Tooltip>
    </div>
  )
}


const useStyles = makeStyles((theme) => ({
  logoGroup: {
    'position': 'fixed',
    'bottom': '90px',
    'left': '25px',
    'width': '140px',
    'height': '50px',
    '& svg': {
      'width': '140px',
      '@media (max-width: 900px)': {
        width: '120px',
        marginBottom: '-50px',
      },
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
  },
}))
