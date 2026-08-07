import React, {ReactElement, useState} from 'react'
import {MenuItem, TextField} from '@mui/material'
import {disablePageReloadApprovalCheck} from '../../utils/event'
import {navigateToModel} from '../../utils/navigate'
import {SAMPLE_MODELS} from './sampleModelRoster'


/**
 * Dropdown variant of the sample picker.
 *
 * Currently unreferenced — SampleModels (the card grid) is what
 * OpenModelDialog renders. Kept because the compact form is still useful
 * for narrow surfaces, but driven off the shared SAMPLE_MODELS roster
 * rather than its own copy of the list: the hardcoded duplicate it used
 * to carry had already drifted out of sync with the real roster.
 *
 * @property {Function} setIsDialogDisplayed callback
 * @return {ReactElement}
 */
export default function SampleModelFileSelector({navigate, setIsDialogDisplayed}) {
  const [selected, setSelected] = useState('')

  const handleSelect = (e, closeDialog) => {
    setSelected(e.target.value)
    disablePageReloadApprovalCheck()
    navigateToModel({pathname: SAMPLE_MODELS[e.target.value].path}, navigate)
    closeDialog()
  }

  return (
    <TextField
      sx={{width: '260px'}}
      value={selected}
      onChange={(e) => handleSelect(e, () => setIsDialogDisplayed(false))}
      variant='outlined'
      label='Sample Projects'
      select
      size='small'
      data-testid='textfield-sample-projects'
    >
      {SAMPLE_MODELS.map((model, i) => (
        <MenuItem value={i} key={model.name}>{model.name.replace(/_/g, ' ')}</MenuItem>
      ))}
    </TextField>
  )
}
