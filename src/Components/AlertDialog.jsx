import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import {RectangularButton} from '../Components/Buttons'
import useStore from '../store/useStore'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import useTheme from '@mui/styles/useTheme'


/** @return {ReactElement} */
export default function AlertDialog({onClose, children}) {
  const alertMessage = useStore((state) => state.alertMessage)
  const setAlertMessage = useStore((state) => state.setAlertMessage)
  const theme = useTheme()
  const onCloseInner = () => {
    setAlertMessage(null)
    onClose()
  }
  return (
    <Dialog
      open={alertMessage !== null}
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
        <Stack spacing={0} sx={{padding: '1em'}}>
            <Stack spacing={0}>
              <Typography variant='overline' sx={{fontWeight: 'bold'}}>Could not load the model</Typography>
              <Typography variant='overline'>Log in if repository is private</Typography>
              <Typography variant='overline'>Check the file path:</Typography>
              <Typography variant='body2' sx={{maxWidth: '360px', overflowWrap: 'break-word'}}>{alertMessage}</Typography>)
            </Stack>
        </Stack>
      </DialogContent>
      <DialogActions >
        <RectangularButton onClick={onCloseInner} variant='outline' title='Reset'/>
      </DialogActions>
    </Dialog>
  )
}
