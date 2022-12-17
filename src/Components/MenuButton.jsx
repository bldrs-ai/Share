import React from 'react'
import Hamburger from '../assets/2D_Icons/menu.svg'
import {Box, Tooltip, IconButton} from '@mui/material'


const MenuButton = ({onClick}) => {
  return (
    <Tooltip title='Properties' placement='left'>
      <IconButton
        edge='start'
        color='secondary'
        aria-label='menu'
        onClick={onClick}
      >
        <Box
          sx={{
            width: '30px',
            height: '30px',
          }}
          component={Hamburger}
        />
      </IconButton>
    </Tooltip>
  )
}


export default MenuButton
