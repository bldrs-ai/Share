import React, {ReactElement} from 'react'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'
import {handleBeforeUnload} from '../../utils/event'

/**
 * @property {Function} setIsDialogDisplayed callback
 * @property {string} label component title
 * @property {boolean} selected selected component control the selected value of the component
 * @property {Function} setSelected callback to select the element
 * @property {Array} list list of element to populate select options
 * @property {boolean} loading indicates if the data is still loading
 * @property {string} [data-testid] id for testing
 * @return {ReactElement}
 */
export default function Selector({
  disabled = false,
  setIsDialogDisplayed,
  label,
  selected,
  setSelected,
  list,
  loading = false,
  ...props
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
      sx={{maxWidth: '260px'}}
      disabled={disabled}
      {...props}
    >
      {loading ? (
        <MenuItem disabled>
          <Box sx={{display: 'flex', justifyContent: 'center', width: '100%'}}>
            <CircularProgress size={24}/>
          </Box>
        </MenuItem>
      ) : (
        list.map((listMember, i) => (
          <MenuItem key={i} value={i}>
            <Typography variant='p'>{listMember}</Typography>
          </MenuItem>
        ))
      )}
    </TextField>
  )
}
