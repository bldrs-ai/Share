import React from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Hamburger from '../assets/icons/menu.svg'


const MenuButton = ({onClick}) => {
  return (
    <Tooltip title="Properties" placement="left">
      <IconButton
        edge='start'
        color='secondary'
        aria-label='menu'
        onClick={onClick}
      >
        <Box sx={{
          width: '30px',
          height: '30px',
        }} component={Hamburger}
        />
      </IconButton>
    </Tooltip>
  )
}


export default MenuButton
