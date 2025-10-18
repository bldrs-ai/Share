import React, {ReactElement} from 'react'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import {disablePageReloadApprovalCheck} from '../../utils/event'


/**
 * @property {Function} setIsDialogDisplayed callback
 * @property {string} label component title
 * @property {boolean} selected selected componet control the selected value of the component
 * @property {Function} setSelected callback to select the element
 * @property {Array} list list of eleemnt to populate select options
 * @property {any} props For prop drilling to the TextField
 * @return {ReactElement}
 */
export default function SelectorSeparator({
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
      sx={{width: '260px', marginBottom: '.5em'}}
      value={selected}
      onChange={(e) => handleSelect(e)}
      variant='outlined'
      label={label}
      select
      size='small'
      {...props}
    >
      {list.map((listMember, i) => {
        if (listMember.isSeparator) {
          return <div style={{borderTop: '0.5px solid #cccccc', margin: '4px 0'}}/>
        }
        return (
          <MenuItem key={i} value={i}><Typography variant='p'>{listMember}</Typography></MenuItem>
        )
      })}
    </TextField>
  )
}

