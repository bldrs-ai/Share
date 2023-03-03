import React, {useState} from 'react'
// import {useNavigate} from 'react-router-dom'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import useTheme from '@mui/styles/useTheme'
import {handleBeforeUnload} from '../utils/event'


/**
 * @property {Function} setIsDialogDisplayed callback
 * @return {React.ReactElement}
 */
export default function Selector({setIsDialogDisplayed, label, selected, list}) {
  // const navigate = useNavigate()
  const [localSelected, setLocalSelected] = useState(selected)
  const theme = useTheme()
  const handleSelect = (e) => {
    setLocalSelected(e.target.value)
    window.removeEventListener('beforeunload', handleBeforeUnload)
    // navigate({pathname: urlList[e.target.value]})
  }


  list.map((x) => console.log(x))

  return (
    <TextField
      sx={{
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
      }}
      value={localSelected}
      onChange={(e) => handleSelect(e)}
      variant='outlined'
      label={label}
      select
      size='small'
    >
      {list.map((listMember, i) => {
        return (
          <MenuItem key={i} value={i}><Typography variant='p'>{listMember[i]}</Typography></MenuItem>
        )
      })}
    </TextField>
  )
}
