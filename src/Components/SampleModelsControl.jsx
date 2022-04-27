import React, {useState} from 'react'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import {makeStyles} from '@mui/styles'
import Dialog from './Dialog'
import ModelIcon from '../assets/2D_Icons/Model.svg'
import {ControlButton} from './Buttons'
import {useNavigate} from 'react-router-dom'


/**
 * Displays open warning.
 * @return {Object} React component
 */
export default function SampleModelsControl({fileOpen}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)

  return (
    <ControlButton
      placement='top'
      title='Models'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      icon={<ModelIcon/>}
      dialog={
        <SampleModelsDialog
          fileOpen={fileOpen}
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={setIsDialogDisplayed}/>}/>)
}


/**
 * @param {boolean} isDialogDisplayed
 * @param {function} setIsDialogDisplayed
 * @return {Object} React component
 */
function SampleModelsDialog({isDialogDisplayed, setIsDialogDisplayed, fileOpen}) {
  const [selected, setSelected] = React.useState('')
  const classes = useStyles()
  const navigate = useNavigate()
  const handleSelect = (e) =>{
    setSelected(e.target.value)
    const modelPath = {
      10: '/share/v/gh/Swiss-Property-AG/Portfolio/main/ASTRA.ifc',
      20: '/share/v/gh/Swiss-Property-AG/Portfolio/main/EISVOGEL.ifc',
      30: '/share/v/gh/Swiss-Property-AG/Portfolio/main/KNIK.ifc',
      40: '/share/v/gh/Swiss-Property-AG/Portfolio/main/MOMENTUM%20TINYHOUSE.ifc',
      50: '/share/v/gh/Swiss-Property-AG/Portfolio/main/NIEDERSCHERLI.ifc',
    }
    console.log('selected', selected)
    console.log('modelPath', modelPath[e.target.value])
    navigate({
      pathname: modelPath[e.target.value],
    })
    setIsDialogDisplayed(false)
  }


  return (
    <Dialog
      icon={<ModelIcon/>}
      headerText='Sample Models'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={
        <div className={classes.content}>
          <div >
            <TextField
              className={classes.root}
              value={selected}
              onChange={(e) => handleSelect(e)}
              variant='outlined'
              label='Connected models'
              select
              size = 'small'
            >
              <MenuItem value=''>
                <em>None</em>
              </MenuItem>
              <MenuItem value={10}>ASTRA.ifc</MenuItem>
              <MenuItem value={20}>EISVOGEL.ifc</MenuItem>
              <MenuItem value={30}>KNIK.ifc</MenuItem>
              <MenuItem value={40}>MOMENTUM TINYHOUSE.ifc</MenuItem>
            </TextField>
          </div>
        </div>

      }/>
  )
}


const useStyles = makeStyles({
  content: {
    width: '260px',
    height: '60px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
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
