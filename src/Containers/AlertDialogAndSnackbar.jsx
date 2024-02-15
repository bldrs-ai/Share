import React from 'react'
import {useNavigate} from 'react-router-dom'
import Snackbar from '@mui/material/Snackbar'
import AlertDialog from '../Components/AlertDialog'
import {navToDefault} from '../Share'
import useStore from '../store/useStore'


/** @return {React.ReactElement} */
export default function AlertAndSnackbar() {
  const appPrefix = useStore((state) => state.appPrefix)

  const snackMessage = useStore((state) => state.snackMessage)
  const setSnackMessage = useStore((state) => state.setSnackMessage)

  const navigate = useNavigate()

  return (
    <>
      <AlertDialog
        onClose={() => {
          setSnackMessage(null)
          navToDefault(navigate, appPrefix)
        }}
      />
      <Snackbar
        anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}
        open={snackMessage !== null}
        style={{bottom: '1em'}}
        message={
          <div style={{wordWrap: 'break-word', whiteSpace: 'normal', maxWidth: '250px'}}>
            {snackMessage}
          </div>
        }
      />
    </>
  )
}
