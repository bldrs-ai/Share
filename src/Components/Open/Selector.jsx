import React, {ReactElement} from 'react'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import {handleBeforeUnload} from '../../utils/event'


/**
 * @property {Function} setIsDialogDisplayed callback
 * @property {string} label component title
 * @property {boolean} selected selected componet control the selected value of the component
 * @property {Function} setSelected callback to select the element
 * @property {Array} list list of element to populate select options
 * @property {string} [testId] id for testing
 * @return {ReactElement}
 */
export default function Selector({
  setIsDialogDisplayed,
  label,
  selected,
  setSelected,
  list,
  testId = 'Selector',
}) {
  const handleSelect = (e) => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
    setSelected(e.target.value)
  }


  return (
    <TextField
      value={selected}
      onChange={(e) => handleSelect(e)}
      variant='outlined'
      label={label}
      select
      size='small'
      sx={{width: '260px', marginBottom: '.5em'}}
      data-testid={testId}
    >
      {list.map((listMember, i) => {
        return (
          <MenuItem key={i} value={i}><Typography variant='p'>{listMember}</Typography></MenuItem>
        )
      })}
    </TextField>
  )
}

