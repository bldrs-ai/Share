import React, {ReactElement} from 'react'
import {MenuItem, TextField, Typography} from '@mui/material'
import {disablePageReloadApprovalCheck} from '../../utils/event'


/**
 * @property {string} label component title
 * @property {boolean} selected selected component control the selected value of the component
 * @property {Function} setSelected callback to select the element
 * @property {Array} list list of elements to populate select options
 * @property {string} [displayValue] When provided, always shown as the selected display value (e.g. current path)
 * @property {any} props For prop drilling to the TextField
 * @return {ReactElement}
 */
export default function SelectorSeparator({
  label,
  selected,
  setSelected,
  list,
  displayValue,
  ...props
}) {
  const handleSelect = (e) => {
    disablePageReloadApprovalCheck()
    setSelected(e.target.value)
  }
  return (
    <TextField
      sx={{
        'width': '100%',
        'marginBottom': '.5em',
        '& .MuiSelect-select': {textAlign: 'left'},
      }}
      value={selected}
      onChange={(e) => handleSelect(e)}
      variant='outlined'
      label={label}
      select
      size='small'
      SelectProps={displayValue ? {displayEmpty: true, renderValue: () => displayValue} : undefined}
      InputLabelProps={displayValue ? {shrink: true} : undefined}
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

