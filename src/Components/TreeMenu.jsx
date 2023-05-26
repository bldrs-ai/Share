import React, {useState} from 'react'
import {useLocation} from 'react-router-dom'
import useStore from '../store/useStore'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import useTheme from '@mui/styles/useTheme'
import debug from '../utils/debug'
import {TooltipIconButton} from './Buttons'
import TreeIcon from '../assets/icons/Tree.svg'
import TypesIcon from '../assets/icons/Types.svg'
import ElementsIcon from '../assets/icons/Elements.svg'


/**
 * BasicMenu used when there are several option behind UI button
 * show/hide from the right of the screen.
 *
 * @param {Array} listOfOptions Title for the drawer
 * @return {object} ItemPropertiesDrawer react component
 */
export default function TreeMenu() {
  const [anchorEl, setAnchorEl] = useState(null)
  // const isNavigationPanelVisible = useStore((state) => state.isNavigationPanelVisible)
  const toggleIsNavigationPanelVisible = useStore((state) => state.toggleIsNavigationPanelVisible)
  const location = useLocation()
  const open = Boolean(anchorEl)
  const theme = useTheme()

  debug().log('CutPlaneMenu: location: ', location)


  const handleClick = (event) => {
    setAnchorEl(event.currentTarget)
  }


  const handleClose = () => {
    setAnchorEl(null)
  }


  return (
    <>
      <TooltipIconButton
        title={'Structure'}
        icon={<TreeIcon/>}
        onClick={handleClick}
      />
      <Menu
        elevation={1}
        id='basic-menu'
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{vertical: 'top', horizontal: 'center'}}
        transformOrigin={{vertical: 'top', horizontal: 'center'}}
        PaperProps={{
          style: {
            transform: 'translateX(70px) translateY(-3px)',
            opacity: .8,
            background: theme.palette.background.control,
            zIndex: 1,
          },
          sx: {
            'color': theme.palette.primary.contrastText,
            '& .Mui-selected': {
              color: theme.palette.secondary.main,
              fontWeight: 800,
            },
            '.MuiMenuItem-root:hover': {
              backgroundColor: 'transparent',
            },
            '.MuiMenuItem-root': {
              padding: '0px',
            },
            '.MuiMenu-paper': {
              padding: '0px',
            },
            '.MuiList-padding': {
              padding: '0px',
            },
          },
        }}
      >

        <MenuItem>
          <TooltipIconButton
            title={`Types`}
            onClick={() => {
              handleClose()
            }}
            icon={<TypesIcon/>}
          />
        </MenuItem>
        <MenuItem>
          <TooltipIconButton
            title={`Elements`}
            onClick={() => {
              handleClose()
              toggleIsNavigationPanelVisible()
            }}
            icon={<ElementsIcon/>}
          />
        </MenuItem>
      </Menu>
    </>
  )
}

