import React, {useEffect, useRef} from 'react'
import {useLocation} from 'react-router-dom'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
import useTheme from '@mui/styles/useTheme'
import {useIsMobile} from '../Hooks'
import {TooltipIconButton} from '../Buttons'
import useStore from '../../store/useStore'
import {hexToRgba} from '../../utils/color'
import {getHashParams} from '../../utils/location'
import HorizonResizerButton from './HorizonResizerButton'
import {PropertiesPanel, NotesPanel} from './SideDrawerPanels'
import CaretIcon from '../../assets/2D_Icons/Caret.svg'


/**
 * @return {React.Component}
 */
export default function SideDrawer() {
  const isDrawerOpen = useStore((state) => state.isDrawerOpen)
  const closeDrawer = useStore((state) => state.closeDrawer)
  const isNotesOn = useStore((state) => state.isNotesOn)
  const isPropertiesOn = useStore((state) => state.isPropertiesOn)
  const openDrawer = useStore((state) => state.openDrawer)
  const openNotes = useStore((state) => state.openNotes)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const sidebarWidth = useStore((state) => state.sidebarWidth)
  const setSidebarWidth = useStore((state) => state.setSidebarWidth)
  const sidebarHeight = useStore((state) => state.sidebarHeight)
  const setSidebarHeight = useStore((state) => state.setSidebarHeight)
  const location = useLocation()
  const isMobile = useIsMobile()
  const sidebarRef = useRef(null)


  useEffect(() => {
    const noteHash = getHashParams(location, 'i')
    if (noteHash !== undefined) {
      const extractedCommentId = noteHash.split(':')[1]
      setSelectedNoteId(Number(extractedCommentId))
      if (!isDrawerOpen) {
        openDrawer()
        openNotes()
      }
    }

    // This address bug #314 by clearing selected issue when new model is loaded
    if (noteHash === undefined && isDrawerOpen) {
      setSelectedNoteId(null)
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, openDrawer, setSelectedNoteId])


  useEffect(() => {
    if (!isNotesOn && !isPropertiesOn && isDrawerOpen) {
      closeDrawer()
    }
  }, [isNotesOn, isPropertiesOn, isDrawerOpen, closeDrawer])


  /** Notes and Props shouldn't show as active when drawer closed. */
  function onDrawerExpand() {
    if (sidebarHeight === '100vh') {
      setSidebarHeight('50vh')
    } else {
      setSidebarHeight('100vh')
    }
  }


  const theme = useTheme()
  const thickness = 10
  const isDividerOn = isNotesOn && isPropertiesOn
  const borderOpacity = 0.5
  const borderColor = hexToRgba(theme.palette.primary.contrastText, borderOpacity)


  return (
    <Box
      sx={Object.assign({
        display: 'flex',
        flexDirection: 'row',
      }, isMobile ? {
        width: '100%',
        height: sidebarHeight,
      } : {
        top: 0,
        right: 0,
        width: sidebarWidth,
        height: '100vh',
        minWidth: '8px',
        maxWidth: '100vw',
      })}
    >
      <Paper
        sx={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          borderLeft: isMobile ? 'none' : `solid 1px ${borderColor}`,
          borderRadius: 0,
        }}
        ref={sidebarRef}
        onMouseDown={(e) => e.preventDefault()}
      >
        {!isMobile &&
          <HorizonResizerButton
            sidebarRef={sidebarRef}
            thickness={thickness}
            isOnLeft={true}
            sidebarWidth={sidebarWidth}
            setSidebarWidth={setSidebarWidth}
          />
        }
        {/* Content */}
        <Box
          sx={{
            width: '100%',
            margin: '1em',
            overflow: 'hidden',
          }}
        >
          {isMobile && <DrawerExpandButton onClick={onDrawerExpand}/>}
          <Box
            sx={{
              display: isNotesOn ? 'block' : 'none',
              height: isPropertiesOn ? `50%` : '100%',
              overflowX: 'hidden',
              overflowY: 'auto',
            }}
          >
            {isNotesOn && <NotesPanel/>}
          </Box>
          {isDividerOn && <Divider sx={{borderColor: borderColor}}/>}
          <Box
            sx={{
              display: isPropertiesOn ? 'block' : 'none',
              height: isNotesOn ? `50%` : '100%',
              marginTop: isDividerOn ? '1em' : '0',
            }}
          >
            {isPropertiesOn && <PropertiesPanel includeGutter={!isDividerOn}/>}
          </Box>
        </Box>
      </Paper>
    </Box>
  )
}


/** @return {React.Component} */
function DrawerExpandButton({onClick}) {
  const isMobile = useIsMobile()
  return (
    <Box
      sx={{
        'display': isMobile ? 'flex' : 'none',
        'justifyContent': 'center',
        'alignItems': 'center',
        '& svg': {
          transform: 'rotate(180deg)',
        },
      }}
    >
      <TooltipIconButton title='Expand' onClick={onClick} icon={<CaretIcon/>} size='small'/>
    </Box>
  )
}
