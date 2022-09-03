import React, {useState} from 'react'
import Box from '@mui/material/Box'
import SwipeableDrawer from '@mui/material/SwipeableDrawer'
import {styled} from '@mui/material/styles'
import {makeStyles} from '@mui/styles'
import {TooltipIconButton} from './Buttons'
import useStore from '../store/useStore'
import CaretIcon from '../assets/2D_Icons/Caret.svg'
import ListIcon from '../assets/2D_Icons/List.svg'
import MarkupIcon from '../assets/2D_Icons/Markup.svg'


/**
 * @param {object} content React component to be wrapped
 * @return {object} React component
 */
export default function MobileDrawer({content}) {
  const [open, setOpen] = useState(true)
  const toggleDrawer = () => setOpen(!open)
  const classes = useStyles({isOpen: open})
  const closeDrawer = useStore((state) => state.closeDrawer)
  const openDrawer = useStore((state) => state.openDrawer)
  const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  const turnCommentsOn = useStore((state) => state.turnCommentsOn)
  const isCommentsOn = useStore((state) => state.isCommentsOn)
  const isPropertiesOn = useStore((state) => state.isPropertiesOn)
  const selectedElement = useStore((state) => state.selectedElement)

  return (
    <div className={classes.swipeDrawer}>
      <SwipeableDrawer
        anchor='bottom'
        variant='persistent'
        open={open}
        onClose={closeDrawer}
        onOpen={openDrawer}
        swipeAreaWidth={drawerBleeding}
        disableSwipeToOpen={false}
      >
        <StyledBox className={classes.contentContainer}>
          <div className={classes.openToggle}>
            <TooltipIconButton title='Expand' onClick={toggleDrawer} icon={<CaretIcon/>}/>
          </div>
          <div className={classes.iconContainer}>
            {
              !isCommentsOn &&
              <TooltipIconButton title='Expand' onClick={() => turnCommentsOn()} icon={<MarkupIcon/>}/>
            }
            {
              selectedElement && !isPropertiesOn &&
              <TooltipIconButton title='Expand' onClick={toggleIsPropertiesOn} icon={<ListIcon/>}/>
            }
          </div>

          {content}
        </StyledBox>
      </SwipeableDrawer>
    </div>
  )
}


const drawerBleeding = 300


const StyledBox = styled(Box)(({theme}) => ({
  backgroundColor: theme.palette.background.paper,
  overflowY: 'scroll',
}))


const useStyles = makeStyles((props) => ({
  swipeDrawer: {
    '& .MuiDrawer-root': {
      height: '100%',
    },
    '& .MuiDrawer-root > .MuiPaper-root': {
      // TODO(pablo): Workaround bug..
      // https://github.com/mui/material-ui/issues/16942
      height: '100%',
      overflow: (p) => p.isOpen ? 'scroll' : 'visible',
    },
  },
  openToggle: {
    'position': 'absolute',
    'right': '0.8em',
    'top': '.2em',
    '& svg': {
      transform: (p) => p.isOpen ? 'none' : 'rotate(180deg)',
    },
  },
  iconContainer: {
    position: 'absolute',
    left: '0.8em',
    top: '.2em',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  contentContainer: {
    position: 'absolute',
    visibility: 'visible',
    top: (p) => p.isOpen ? '0px' : `-${drawerBleeding}px`,
    right: 0,
    left: 0,
    padding: '1em',
    paddingTop: '1.6em',
    borderTop: 'solid 1px grey',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
}))
