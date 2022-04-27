import * as React from 'react'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import {makeStyles} from '@mui/styles'


/**
 * Dropdown select
 * @return {Object} React component
 */
export default function DropDown({onSelect, options}) {
  const [selected, setSelected] = React.useState('')
  const classes = useStyles()

  const handleChange = (event) => {
    setSelected(event.target.value)
    onSelect(event.target.value)
  }

  return (
    <TextField
      className={classes.root}
      value={selected}
      onChange={(e) => handleChange(e)}
      variant='outlined'
      label='Connected models'
      select
      size = 'small'
    >
      <MenuItem value=''>
        <em>None</em>
      </MenuItem>
      <MenuItem value={10}>Ten</MenuItem>
      <MenuItem value={20}>Twenty</MenuItem>
      <MenuItem value={30}>Thirty</MenuItem>
    </TextField>
  )
}


const useStyles = makeStyles({
  root: {
    'width': '260px',
    '& .MuiOutlinedInput-input': {
      color: 'green',
    },
    '& .MuiInputLabel-root': {
      color: 'green',
    },
    '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
      borderColor: 'green',
    },
    '&:hover .MuiOutlinedInput-input': {
      color: 'gray',
    },
    '&:hover .MuiInputLabel-root': {
      color: 'gray',
    },
    '&:hover .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
      borderColor: 'gray',
    },
    '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-input': {
      color: 'green',
    },
    '& .MuiInputLabel-root.Mui-focused': {
      color: 'green',
    },
    '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: 'green',
    },
  },
})

