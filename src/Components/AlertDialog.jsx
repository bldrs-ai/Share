import React from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import {RectangularButton} from '../Components/Buttons'
import useStore from '../store/useStore'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import useTheme from '@mui/styles/useTheme'


/**
 * Alert Dialog is presented when a model cannot be loaded
 *
 * @property {Function} onClose trigger close of the dialog
 * @return {object} React component
 */
export default function AlertDialog({onClose}) {
  const errorPath = useStore((state) => state.errorPath)
  const setErrorPath = useStore((state) => state.setErrorPath)
  const theme = useTheme()
  const onCloseInner = () => {
    setErrorPath(null)
    onClose()
  }

  /**
   * Insert the spaces after / _ character to make sure the string breaks correctly
   *
   * @property {string} str error path, usually a long string
   * @return {string} formatted string
   */
  const insertZeroWidthSpaces = (str) => {
    return str.replace(/([/_-])/g, '$1\u200B')
  }

  return (
    <Dialog
      open={errorPath !== null}
      onClose={onCloseInner}
      aria-labelledby='alert-dialog-title'
      aria-describedby='alert-dialog-description'
    >
      <DialogTitle id='alert-dialog-title'>
        <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
            }}
        >
          <Paper
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: '2.5em',
              height: '2.5em',
              borderRadius: '50%',
              background: theme.palette.secondary.main,
            }}
          >
            <ErrorOutlineIcon className='icon-share'/>
          </Paper>
        </Box>
      </DialogTitle>
      <DialogContent sx={{textAlign: 'left'}}>
      <Stack spacing={1} sx={{padding: '0em 1em'}}>
        <List>
          <ListItem variant='alert'>
            <ListItemText
              primary={
                <Typography
                  variant='body1'
                  sx={{fontWeight: 'bold'}}
                >
                  Could not load the model
                </Typography>
              }
              primaryTypographyProps={{variant: 'body1'}}
            />
          </ListItem>
          <ListItem variant='alert'>
            <ListItemText
              primary="Log in if repository is private"
              primaryTypographyProps={{variant: 'body1'}}
            />
          </ListItem>
          <ListItem variant='alert'>
            <ListItemText
              primary={
                <Typography
                  variant='body1'
                  sx={{
                    maxWidth: '300px',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    whiteSpace: 'normal',
                  }}
                >
                <Typography variant='body1' sx={{fontWeight: 'bold'}}>
                  Check the file path:
                </Typography>
                  {errorPath && insertZeroWidthSpaces(errorPath)}
                </Typography>
              }
            />
          </ListItem>
          <ListItem variant='alert'>
            <ListItemText
              primary={
                <Typography variant='body1'>
                  Contact us on our{' '}
                  <Link href='https://discord.gg/9SxguBkFfQ' target="_blank" rel="noopener noreferrer">
                    Discord
                  </Link>{' '}
                  for help
                </Typography>
              }
            />
          </ListItem>
        </List>
      </Stack>
      </DialogContent>
      <DialogActions >
        <RectangularButton onClick={onCloseInner} variant='outline' title='Reset'/>
      </DialogActions>
    </Dialog>
  )
}
