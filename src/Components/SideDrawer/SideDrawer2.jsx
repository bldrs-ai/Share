import React, {useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import useStore from '../../store/useStore'
import {getHashParams} from '../../utils/location'
import Notes from '../Notes/Notes2'
import Properties from '../Notes/Notes2'
import List from '@mui/material/List'
import ListSubheader from '@mui/material/ListSubheader'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
// import FormControl from '@mui/material/FormControl'
// import Select from '@mui/material/Select'
// import MenuItem from '@mui/material/MenuItem'


/**
 * @return {React.Component}
 */
export default function SideDrawer() {
  const isDrawerOpen = useStore((state) => state.isDrawerOpen)
  const closeDrawer = useStore((state) => state.closeDrawer)
  // const isNotesOn = useStore((state) => state.isNotesOn)
  // const isPropertiesOn = useStore((state) => state.isPropertiesOn)
  const openDrawer = useStore((state) => state.openDrawer)
  const openNotes = useStore((state) => state.openNotes)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const location = useLocation()
  const drawerWidth = 460


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


  // useEffect(() => {
  //   if (!isNotesOn && !isPropertiesOn && isDrawerOpen) {
  //     closeDrawer()
  //   }
  // }, [isNotesOn, isPropertiesOn, isDrawerOpen, closeDrawer])


  return (
    <Drawer
      variant="temporary"
      disableEnforceFocus
      anchor={'right'}
      open={isDrawerOpen}
      color='primary'
      elevation={0}
      hideBackdrop
      disableScrollLock
      ModalProps={{
        slots: {backdrop: 'div'},
        slotProps: {
          root: { // override the fixed position + the size of backdrop
            style: {
              position: 'absolute',
              top: 'unset',
              bottom: 'unset',
              left: 'unset',
              right: 'unset',
            },
          },
        },
      }}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: {
          width: drawerWidth,
          backgroundColor: (theme) => theme.palette.background.default,
          boxSizing: 'border-box',
          overflow: 'hidden'},
      }}
    >
      <Box sx={{
        height: '50%',
        overflow: 'scroll'}}
      >
        <List
          spacing={1}
        >
          <ListSubheader>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Typography variant='body1'>Notes</Typography>
              <Stack
                direction="row"
                justifyContent="center"
                alignItems="center"
                spacing={1}
              >
                <IconButton aria-label="comments" size='small' onClick={closeDrawer}>
                  <CloseIcon fontSize='small'/>
                </IconButton>
              </Stack>
            </Stack>
          </ListSubheader>
          <Notes/>
        </List>
      </Box>
      <Box sx={{
        height: '50%',
        overflow: 'scroll'}}
      >
        <List
          spacing={1}
        >
          <ListSubheader>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Typography variant='body1'>Notes</Typography>
              <Stack
                direction="row"
                justifyContent="center"
                alignItems="center"
                spacing={1}
              >
                <IconButton aria-label="comments" size='small' onClick={closeDrawer}>
                  <CloseIcon fontSize='small'/>
                </IconButton>
              </Stack>
            </Stack>
          </ListSubheader>
          <Properties/>
        </List>
      </Box>
    </Drawer>
  )
}
