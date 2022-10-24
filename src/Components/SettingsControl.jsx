import React, {createRef, useState} from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Dialog from './Dialog'
import {ControlButton} from './Buttons'
import ModelsIcon from '../assets/2D_Icons/Model.svg'
import SettingsIcon from '../assets/2D_Icons/Settings.svg'


/**
 * Displays open warning.
 *
 * @return {object} React component
 */
export default function SettingsControl() {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  return (
    <ControlButton
      title='Settings'
      icon={<SettingsIcon/>}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      dialog={
        <SettingsDialog
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={setIsDialogDisplayed}
        />
      }
    />
  )
}


/**
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {object} React component
 */
function SettingsDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  const urlTextFieldRef = createRef()
  return (
    <Dialog
      icon={<ModelsIcon/>}
      headerText='Settings'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={
        <Box sx={{
          width: '270px',
          height: '140px',
          marginTop: '6px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'space-between',
        }}
        >
          <Typography variant={'p'}>
            Model path to load on start
          </Typography>
          <TextField
            value={window.location}
            inputRef={urlTextFieldRef}
            variant='outlined'
            multiline
            rows={3}
            sx={{width: '100%'}}
          />
        </Box>
      }
    />
  )
}
