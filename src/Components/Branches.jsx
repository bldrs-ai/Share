import React, {useContext} from 'react'
import {useNavigate} from 'react-router-dom'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import {makeStyles} from '@mui/styles'
import {ColorModeContext} from '../Context/ColorMode'


/**
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {object} React component
 */
export default function Branches() {
  const classes = useStyles()
  const [selected, setSelected] = React.useState('')
  const navigate = useNavigate()
  const colorMode = useContext(ColorModeContext)
  const handleSelect = (e) => {
    setSelected(e.target.value)
    const modelPath = {
      0: '/share/v/gh/Swiss-Property-AG/Seestrasse-Public/main/SEESTRASSE.ifc#c:119.61,50.37,73.68,16.18,11.25,5.74',
      1: '/share/v/gh/Swiss-Property-AG/Seestrasse-Public/Version-1/SEESTRASSE.ifc#c:119.61,50.37,73.68,16.18,11.25,5.74',
      2: '/share/v/gh/IFCjs/test-ifc-files/main/Schependomlaan/IFC%20Schependomlaan.ifc#c:60.45,-4.32,60.59,1.17,5.93,-3.77',
    }
    navigate({
      pathname: modelPath[e.target.value],
    })
  }


  return (
    <Paper elevation={0}
      sx={{
        backgroundColor: colorMode.isDay() ? '#E8E8E8' : '#4C4C4C',
        opacity: .8,
      }}
    >
      <TextField
        className={classes.dropDown}
        value={selected}
        onChange={(e) => handleSelect(e)}
        variant='outlined'
        label='IFC Branches'
        select
      >
        <MenuItem value={0}><Typography variant='p'>Version_1</Typography></MenuItem>
        <MenuItem value={1}><Typography variant='p'>Version_2 + Context</Typography></MenuItem>
        <MenuItem value={2}><Typography variant='p'>Version_3</Typography></MenuItem>
      </TextField>
    </Paper>
  )
}


const useStyles = makeStyles((theme) => ({
  dropDown: {
    'width': '300px',
    '& .MuiOutlinedInput-input': {
      color: theme.palette.highlight.heavy,
    },
    '& .MuiInputLabel-root': {
      color: theme.palette.highlight.heavier,
    },
    '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.primary.main,
    },
    '&:hover .MuiOutlinedInput-input': {
      color: theme.palette.highlight.heavy,
    },
    '&:hover .MuiInputLabel-root': {
      color: theme.palette.highlight.secondary,
    },
    '&:hover .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.primary.main,
    },
    '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-input': {
      color: theme.palette.highlight.secondary,
    },
    '& .MuiInputLabel-root.Mui-focused': {
      color: theme.palette.highlight.secondary,
    },
    '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.primary.main,
    },
  },
}),
)
