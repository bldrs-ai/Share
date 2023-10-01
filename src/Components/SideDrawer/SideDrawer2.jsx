import React, {useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import useStore from '../../store/useStore'
import {getHashParams} from '../../utils/location'
import List from '@mui/material/List'
import ListSubheader from '@mui/material/ListSubheader'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import CloseIcon from '@mui/icons-material/Close'
import FormControl from '@mui/material/FormControl'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import ListIcon from '@mui/icons-material/List'


/**
 * @return {React.Component}
 */
export default function SideDrawer({topPanel, bottomPanel}) {
  const isDrawerOpen = useStore((state) => state.isDrawerOpen)
  const closeDrawer = useStore((state) => state.closeDrawer)
  // const isNotesOn = useStore((state) => state.isNotesOn)
  // const isPropertiesOn = useStore((state) => state.isPropertiesOn)
  const openDrawer = useStore((state) => state.openDrawer)
  const openNotes = useStore((state) => state.openNotes)
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId)
  const location = useLocation()

  const [isFirstPanel, setIsFirstPanel] = React.useState(true)
  const [isSecondPanel, setIsSecondPanel] = React.useState(true)

  const [firstPanel, setFirstPanel] = React.useState('first')
  const [secondPanel, setSecondPanel] = React.useState('second')
  const drawerWidth = 400


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
  const handlePanelSelectionFirst = (event) => {
    const panel = event.target.value
    if (panel === 'top') {
      setFirstPanel('first')
    } else if (panel === 'bottom') {
      setFirstPanel('second')
    }
  }

  const handlePanelSelectionSecond = (event) => {
    const panel = event.target.value
    if (panel === 'top') {
      setSecondPanel('first')
    } else if (panel === 'bottom') {
      setSecondPanel('second')
    }
  }

  useEffect(() => {
    if (!isFirstPanel && !isSecondPanel) {
      closeDrawer()
      setIsFirstPanel(true)
      setIsSecondPanel(true)
    }
  }, [setIsFirstPanel, setIsSecondPanel, isFirstPanel, isSecondPanel])


  return (
    <Box sx={{display: 'flex'}}>
      <Drawer
        variant="temporary"
        anchor={'left'}
        open={isDrawerOpen}
        elevation={0}
        hideBackdrop
        disableScrollLock
        disableEnforceFocus
        ModalProps={{
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
            backgroundColor: (theme) => theme.palette.scene.background,
            borderLeft: `1px solid lightgrey}`,
            boxSizing: 'border-box',
            overflow: 'hidden'},
        }}
      >
        {(isFirstPanel) &&
            <Box
              sx={{
                minHeight: '50%',
                overflowY: 'scroll',
              }}
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
                    <FormControl variant="standard"
                      sx={{
                        'm': 1,
                        'color': 'default',
                        '& .MuiInput-underline:after': {
                          borderBottom: 'none', // remove the bottom border when focused
                        },
                        '& .MuiInput-underline:before': {
                          borderBottom: 'none', // remove the initial bottom border
                        },
                      }}
                    >
                      <Select
                        value={firstPanel === 'first' ? 'top' : 'bottom'}
                        onChange={handlePanelSelectionFirst}
                        displayEmpty
                        size='small'
                        sx={{
                          '& .MuiPaper-root': {
                            borderRadius: 0, // this sets the dropdown's border radius to 0
                          },
                        }}
                      >
                        <MenuItem value="top">{'Notes'}</MenuItem>
                        <MenuItem value="bottom">{'Properties'}</MenuItem>
                      </Select>
                    </FormControl>
                    <Stack
                      direction="row"
                      justifyContent="center"
                      alignItems="center"
                      spacing={.5}
                    >
                      {!isSecondPanel &&
                            <IconButton aria-label="comments" size='small' onClick={() => setIsSecondPanel(true)}>
                              <ListIcon fontSize='small'/>
                            </IconButton>
                      }
                      {/* {topPanelButton} */}
                      <IconButton aria-label="comments" size='small' onClick={() => setIsFirstPanel(false)}>
                        <CloseIcon fontSize='small'/>
                      </IconButton>
                    </Stack>
                  </Stack>
                </ListSubheader>
                {firstPanel === 'first' && topPanel}
                {firstPanel === 'second' && bottomPanel}
              </List>
              {/* {topPanel} */}
            </Box>
        }
        {(isSecondPanel) &&
            <Box
              sx={{
                minHeight: '50%',
                overflowY: 'scroll',
              }}
            >
              <List
                spacing={1}
              >
                <ListSubheader>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{height: '40px'}}
                  >
                    <FormControl variant="standard"
                      sx={{
                        'm': 1,
                        'color': 'default',
                        '& .MuiInput-underline:after': {
                          borderBottom: 'none', // remove the bottom border when focused
                        },
                        '& .MuiInput-underline:before': {
                          borderBottom: 'none', // remove the initial bottom border
                        },
                      }}
                    >
                      <Select
                        value={secondPanel === 'second' ? 'bottom' : 'top'}
                        onChange={handlePanelSelectionSecond}
                        displayEmpty
                        size='small'
                      >
                        <MenuItem value="top">{'Fist panel'}</MenuItem>
                        <MenuItem value="bottom">{'Second panel'}</MenuItem>
                      </Select>
                    </FormControl>
                    <Stack
                      direction="row"
                      justifyContent="center"
                      alignItems="center"
                      spacing={.5}
                    >
                      {!isFirstPanel &&
                            <IconButton aria-label="comments" size='small' onClick={() => setIsFirstPanel(true)}>
                              <ListIcon fontSize='small'/>
                            </IconButton>
                      }
                      {/* {bottomPanelButton} */}
                      <IconButton aria-label="comments" size='small' onClick={() => setIsSecondPanel(false)}>
                        <CloseIcon fontSize='small'/>
                      </IconButton>
                    </Stack>
                  </Stack>
                </ListSubheader>
                {secondPanel === 'first' && topPanel}
                {secondPanel === 'second' && bottomPanel}
              </List>
              {/* {topPanel} */}
            </Box>
        }
      </Drawer>
    </Box>
  )
}
