import React, {ReactElement} from 'react'
import {MenuItem, TextField, Typography} from '@mui/material'
import {disablePageReloadApprovalCheck} from '../../utils/event'


/**
 * @property {Function} setIsDialogDisplayed callback
 * @property {string} label component title
 * @property {boolean} selected selected componet control the selected value of the component
 * @property {Function} setSelected callback to select the element
 * @property {Array} list list of element to populate select options
 * @property {string} [data-testid] id for testing
 * @return {ReactElement}
 */
export default function Selector({
  label,
  selected,
  setSelected,
  list,
  ...props
}) {
  const handleSelect = (e) => {
    disablePageReloadApprovalCheck()
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
      sx={{maxWidth: '260px', marginBottom: '.5em'}}
      {...props}
    >
      {list.map((listMember, i) => {
        return (
          <MenuItem key={i} value={i}><Typography variant='p'>{listMember}</Typography></MenuItem>
        )
      })}
    </TextField>
  )
}

