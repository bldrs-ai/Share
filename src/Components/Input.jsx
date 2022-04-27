import React, {useRef, useState} from 'react'
import InputBase from '@mui/material/InputBase'
import Paper from '@mui/material/Paper'
import {makeStyles} from '@mui/styles'
import {FormButton} from './Buttons'
import SubmitIcon from '../assets/2D_Icons/Submit.svg'


/**
 * Search bar component
 * @param {function} onClickMenuCb callback
 * @param {boolean} showNavPanel toggle
 * @return {Object} The SearchBar react component
 */
export default function Input({placeholderText, tooltipText = 'submit', inputWidth = '100px', icon = <SubmitIcon/>}) {
  const [inputText, setInputText] = useState('')
  const [error, setError] = useState('')
  const onInputChange = (event) => setInputText(event.target.value)
  const searchInputRef = useRef(null)
  const classes = useStyles({inputWidth: inputWidth})

  const onSubmit = (event) => {
    // Prevent form event bubbling and causing page reload.
    event.preventDefault()
    if (error.length > 0) {
      setError('')
    }
  }
  return (
    <div>
      <Paper elevation = {0} component='form' className={classes.root} onSubmit={onSubmit}>
        <InputBase
          inputRef={searchInputRef}
          value={inputText}
          onChange={onInputChange}
          error = {true}
          placeholder={placeholderText}/>
        <FormButton
          title={tooltipText}
          size = 'small'
          placement = 'bottom'
          icon={icon}/>
      </Paper>
      { inputText.length>0 &&
        error.length>0 &&
        <div className = {classes.error}>{error}</div>
      }
    </div>
  )
}


const useStyles = makeStyles({
  root: {
    'display': 'flex',
    'minWidth': '200px',
    'width': (props) => props.inputWidth,
    'maxWidth': '700px',
    'alignItems': 'center',
    'height': '40px',
    'border': '1px solid lightGrey',
    '@media (max-width: 900px)': {
      minWidth: '260px',
      width: '260px',
      maxWidth: '260px',
    },
    '& .MuiInputBase-root': {
      flex: 1,
      paddingLeft: '10px',
      borderRadius: '10px',
    },
  },
  error: {
    marginLeft: '10px',
    marginTop: '3px',
    fontSize: '10px',
    color: 'red',
  },
})
