import React, {useContext, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {makeStyles} from '@mui/styles'
import {ColorModeContext} from '../Context/ColorMode'
import OpenModelControl from './OpenModelControl'

// TODO Oleg:  obtain the name of the model from the permalink - if a model form the GIthub is currently loaded


/**
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {object} React component
 */
export default function Files({fileOpen}) {
  const classes = useStyles()
  const navigate = useNavigate()
  const colorMode = useContext(ColorModeContext)
  const [selected, setSelected] = useState(0)

  const handleSelect = (e) => {
    setSelected(e.target.value)
    const modelPath = {
      0: '',
      1: '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc#c:-38.64,12.52,35.4,-5.29,0.94,0.86',
      2: '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72',
      3: '/share/v/gh/Swiss-Property-AG/Eisvogel-Public/main/EISVOGEL.ifc#c:107.36,8.46,156.67,3.52,2.03,16.71',
      4: '/share/v/gh/Swiss-Property-AG/Seestrasse-Public/main/SEESTRASSE.ifc#c:119.61,50.37,73.68,16.18,11.25,5.74',
      // eslint-disable-next-line max-len
      5: '/share/v/gh/sujal23ks/BCF/main/packages/fileimport-service/ifc/ifcs/171210AISC_Sculpture_brep.ifc/120010/120020/120023/4998/2867#c:-163.46,16.12,223.99,12.03,-28.04,-15.28',
    }
    navigate({
      pathname: modelPath[e.target.value],
    })
  }

  return (
    <>
      <Paper elevation={0}
        sx={{
          backgroundColor: colorMode.isDay() ? '#E8E8E8' : '#4C4C4C',
          marginTop: '18px',
          opacity: .8,
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'flex-start',
          alignItems: 'center',
        }}
      >
        <div style={{
          marginLeft: '7px',
          marginRight: '-3px',
          zIndex: 10,
        }}
        >
          <OpenModelControl fileOpen={fileOpen}/>
        </div>
        <TextField
          className={classes.dropDown}
          value={selected}
          onChange={(e) => handleSelect(e)}
          variant='outlined'
          label='Project File'
          select
        >
          <MenuItem value={0}><Typography variant='p'>../../Blrds.ifc</Typography></MenuItem>
          <MenuItem value={1}><Typography variant='p'>Momentum.ifc</Typography></MenuItem>
          <MenuItem value={2}><Typography variant='p'>Schneestock.ifc</Typography></MenuItem>
          <MenuItem value={3}><Typography variant='p'>Eisvogel.ifc</Typography></MenuItem>
          <MenuItem value={4}><Typography variant='p'>Seestrasse.ifc</Typography></MenuItem>
          <MenuItem value={5}><Typography variant='p'>Structural_Detail.ifc</Typography></MenuItem>
        </TextField>
      </Paper>
    </>

  )
}


const useStyles = makeStyles((theme) => ({
  dropDown: {
    'width': '250px',
    '& .MuiOutlinedInput-input': {
      color: theme.palette.highlight.grey,
    },
    '& .MuiInputLabel-root': {
      color: theme.palette.highlight.heaviest,
    },
    '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.highlight.background,
    },
    '&:hover .MuiOutlinedInput-input': {
      color: theme.palette.highlight.heaviest,
    },
    // TODO(oleg): connect to props
    '&:hover .MuiInputLabel-root': {
      color: theme.palette.highlight.heaviest,
    },
    '&:hover .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.highlight.background,
    },
    // TODO(oleg): connect to props
    '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-input': {
      color: theme.palette.highlight.maximum,
    },
    // TODO(oleg): connect to props
    '& .MuiInputLabel-root.Mui-focused': {
      color: theme.palette.highlight.heaviest,
    },
    '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.highlight.background,
    },
  },
}),
)
