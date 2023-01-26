import React, {useEffect, useContext} from 'react'
import {useLocation} from 'react-router-dom'
import Box from '@mui/material/Box'
import {useTheme} from '@mui/styles'
import OperationsGroup from '../../Components/OperationsGroup'
import {ColorModeContext} from '../../Context/ColorMode'
import useStore from '../../store/useStore'
import {getHashParams} from '../../utils/location'
import CaretIcon from '../../assets/2D_Icons/Caret.svg'
import {useIsMobile} from '../Hooks'
import {TooltipIconButton} from '../Buttons'
import {PropertiesPanel, NotesPanel} from './SideDrawerPanels'
import {dayColor, nightColor} from '../../utils/constants'


export const SIDE_DRAWER_WIDTH = '31em'


/**
 * SideDrawerWrapper is the container for the SideDrawer component.
 * it is loaded into the CadView, connected to the store and passes the props to the sideDrawer.
 * It makes it is possible to test Side Drawer outside of the cad view.
 *
 * @return {object} SideDrawer react component
 */
export default function SideDrawerWrapper({unSelectItem}) {
  const isDrawerOpen = useStore((state) => state.isDrawerOpen)
  const closeDrawer = useStore((state) => state.closeDrawer)
  const isCommentsOn = useStore((state) => state.isCommentsOn)
  const isPropertiesOn = useStore((state) => state.isPropertiesOn)
  const openDrawer = useStore((state) => state.openDrawer)
  const turnCommentsOn = useStore((state) => state.turnCommentsOn)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const location = useLocation()
  const isMobile = useIsMobile()
  const theme = useTheme()
  const colorTheme = useContext(ColorModeContext)
  const viewer = useStore((state) => state.viewer)


  useEffect(() => {
    const noteHash = getHashParams(location, 'i')
    if (noteHash !== undefined) {
      const extractedCommentId = noteHash.split(':')[1]
      setSelectedNoteId(Number(extractedCommentId))
      if (!isDrawerOpen) {
        openDrawer()
        turnCommentsOn()
      }
    }

    // This address bug #314 by clearing selected issue when new model is loaded
    if (noteHash === undefined && isDrawerOpen) {
      setSelectedNoteId(null)
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, openDrawer, setSelectedNoteId])


  useEffect(() => {
    if (!isCommentsOn && !isPropertiesOn && isDrawerOpen) {
      closeDrawer()
    }
  }, [isCommentsOn, isPropertiesOn, isDrawerOpen, closeDrawer])


  return (
    <Box
      sx={{
        position: 'absolute',
        display: 'flex',
        borderLeft: 'grey 1px solid',
        flexDirection: 'row',
        height: '100%',
        top: 0,
        right: 0,
      }}
    >
      {viewer &&
        <OperationsGroup
          unSelectItem={unSelectItem}
        />
      }
      <Box sx={{
        display: isDrawerOpen ? 'flex' : 'none',
        minWidth: '150px',
        width: isMobile ? '100vw' : SIDE_DRAWER_WIDTH,
        height: '100%',
        flexDirection: 'column',
        overflowY: 'auto',
        backgroundColor: colorTheme.isDay() ? dayColor : nightColor,
        borderLeft: 'grey 1px solid',
      }}
      >
        <Box sx={{
          'display': isMobile ? 'flex' : 'none',
          'justifyContent': 'center',
          'alignItems': 'center',
          '& svg': {
            transform: 'rotate(180deg)',
          },
        }}
        >
          <TooltipIconButton title='Expand' onClick={closeDrawer} icon={<CaretIcon/>}/>
        </Box>
        <Box
          sx={{
            display: isCommentsOn ? 'block' : 'none',
            borderBottom: `${theme.palette.highlight.heaviest} 1px solid`,
            padding: '0 .5em',
          }}
        >
          {isCommentsOn && <NotesPanel/>}
        </Box>
        <Box
          sx={{
            display: isPropertiesOn ? 'block' : 'none',
            padding: '0 .5em',
          }}
        >
          {isPropertiesOn && <PropertiesPanel/>}
        </Box>
      </Box>
    </Box>
  )
}
