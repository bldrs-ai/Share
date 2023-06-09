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
// import SetsIcon from '../assets/icons/Sets.svg'
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
  const isNavPanelOpen = useStore((state) => state.isNavPanelOpen)
  const showNavPanel = useStore((state) => state.showNavPanel)
  const hideNavPanel = useStore((state) => state.hideNavPanel)
  const isElementNavigation = useStore((state) => state.isElementNavigation)
  const setElementNavigation = useStore((state) => state.setElementNavigation)
  const setTypeNavigation = useStore((state) => state.setTypeNavigation)
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
  const toggleIsNavPanelOpen = (isElementNavigationLocal) => {
    if (isNavPanelOpen && isElementNavigationLocal === isElementNavigation ) {
      hideNavPanel()
    } else {
      showNavPanel()
    }
  }

  return (
    <>
      <TooltipIconButton
        title={'Navigation'}
        showTitle={false}
        placement={'bottom'}
        selected={isNavPanelOpen}
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
            transform: 'translateX(66px) translateY(-3px)',
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
            showTitle={true}
            title={`Elements`}
            selected={isElementNavigation === true && isNavPanelOpen}
            onClick={() => {
              handleClose()
              setElementNavigation()
              toggleIsNavPanelOpen(true)
            }}
            icon={<ElementsIcon style={{width: '15px', height: '15px'}}/>}
          />
        </MenuItem>
        <MenuItem>
          <TooltipIconButton
            showTitle={true}
            title={`Types`}
            selected={isElementNavigation !== true && isNavPanelOpen}
            onClick={() => {
              handleClose()
              setTypeNavigation()
              toggleIsNavPanelOpen(false)
            }}
            icon={<TypesIcon style={{width: '15px', height: '15px'}}/>}
          />
        </MenuItem>
        {/* <MenuItem>
          <TooltipIconButton
            title={`Sets`}
            selected={isElementNavigation !== true && isNavPanelOpen}
            onClick={() => {
              handleClose()
              setTypeNavigation()
              toggleIsNavPanelOpen(false)
            }}
            icon={<SetsIcon style={{width: '15px', height: '15px'}}/>}
          />
        </MenuItem> */}
      </Menu>
    </>
  )
}

