import React from 'react'
import {makeStyles} from '@mui/styles'
import IconButton from '@mui/material/IconButton'
import Hamburger from '../assets/2D_Icons/menu.svg'
import Tooltip from '@mui/material/Tooltip'


const useStyles = makeStyles({
  menuButton: {
    'border': '2px solid lime',
    '@media (max-width: 1280px)': {
      border: '2px solid lime',
    },
  },
  menuButtonDisabled: {
    '@media (max-width: 1280px)': {},
  },
  icon: {
    width: '30px',
    height: '30px',
  },
})

const MenuButton = ({onClick}) => {
  const classes = useStyles()
  return (
    <Tooltip title="Properties" placement="left">
      <IconButton
        edge='start'
        color='secondary'
        aria-label='menu'
        onClick={onClick}
      >
        <Hamburger className={classes.icon} />
      </IconButton>
    </Tooltip>
  )
}

export default MenuButton
