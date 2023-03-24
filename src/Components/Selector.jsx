import React from 'react'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import useTheme from '@mui/styles/useTheme'
import {handleBeforeUnload} from '../utils/event'


/**
 * @property {Function} setIsDialogDisplayed callback
 * @property {string} label component title
 * @property {boolean} selected selected componet control the selected value of the component
 * @property {Function} setSelected callback to select the element
 * @property {Array} list list of eleemnt to populate select options
 * @property {string} testId id for testing
 * @return {React.ReactElement}
 */
export default function Selector({setIsDialogDisplayed, label, selected, setSelected, list, testId = 'Selector'}) {
  const theme = useTheme()
  const handleSelect = (e) => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
    setSelected(e.target.value)
  }


  return (
    <TextField
      sx={selectorStyles(theme)}
      value={selected}
      onChange={(e) => handleSelect(e)}
      variant='outlined'
      label={label}
      select
      size='small'
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

const selectorStyles = (theme) => {
  return (
    {
      'width': '260px',
      'padding': '0px 0px 12px 0px',
      '& .MuiOutlinedInput-input': {
        color: theme.palette.secondary.main,
      },
      '& .MuiInputLabel-root': {
        color: theme.palette.secondary.main,
      },
      '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
        borderColor: theme.palette.secondary.main,
      },
      '&:hover .MuiOutlinedInput-input': {
        color: theme.palette.secondary.main,
      },
      '&:hover .MuiInputLabel-root': {
        color: theme.palette.secondary.main,
      },
      '&:hover .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
        borderColor: theme.palette.secondary.main,
      },
      '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-input': {
        color: theme.palette.secondary.main,
      },
      '& .MuiInputLabel-root.Mui-focused': {
        color: theme.palette.secondary.main,
      },
      '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
        borderColor: theme.palette.secondary.main,
      },
    }
  )
}
