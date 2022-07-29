import React, {useRef, useState} from 'react'
import InputBase from '@mui/material/InputBase'
import Paper from '@mui/material/Paper'
import {makeStyles} from '@mui/styles'
import {TooltipToggleButton} from './Buttons'
import Divider from '@mui/material/Divider'
import {UilMinusSquare, UilSearch} from '@iconscout/react-unicons'


/**
 * Search bar component
 * @return {Object} The SearchBar react component
 */
export default function InputBar({startAdorment, onSubmit}) {
  const [inputText, setInputText] = useState('')
  const onInputChange = (event) => setInputText(event.target.value)
  const searchInputRef = useRef(null)
  const classes = useStyles({inputWidth: '288px'})
  return (
    <div>
      <Paper component='form' className={classes.root}>
        <div className={classes.iconContainer}>
          {startAdorment}
        </div>
        <Divider orientation="vertical" flexItem
          style={{
            height: '30px',
            alignSelf: 'center',
            margin: '0px 10px 0px 0px',
          }}
        />
        <InputBase
          inputRef={searchInputRef}
          value={inputText}
          onChange={onInputChange}
          error={true}
          placeholder={'Paste GitHub link here'}/>
        {inputText.length > 0 ?
          <TooltipToggleButton
            title='clear'
            size='small'
            placement='bottom'
            onClick={() => {
              setInputText('')
            }}
            icon={<UilMinusSquare/>}/> : null
        }
        {inputText.length > 0 ?
          <TooltipToggleButton
            title='search'
            size='small'
            placement='bottom'
            onClick={() => onSubmit()}
            icon={<UilSearch/>}/> : null
        }
      </Paper>
    </div>
  )
}


const useStyles = makeStyles({
  root: {
    'display': 'flex',
    'minWidth': '200px',
    'width': (props) => props.inputWidth,
    'maxWidth': '400px',
    'alignItems': 'center',
    'padding': '2px 2px 2px 2px',
    '@media (max-width: 900px)': {
      minWidth: '300px',
      width: '300px',
      maxWidth: '300px',
    },
    '& .MuiInputBase-root': {
      flex: 1,
    },
  },
  error: {
    marginLeft: '10px',
    marginTop: '3px',
    fontSize: '10px',
    color: 'red',
  },
  divider: {
    height: '30px',
    alignSelf: 'center',
    margin: '0px 10px 0px 0px',
  },
  iconContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '30px',
    height: '30px',
    margin: '5px',
  },
})
