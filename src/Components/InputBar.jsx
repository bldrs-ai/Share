import React, {useRef, useState} from 'react'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import InputBase from '@mui/material/InputBase'
import {TooltipIconButton} from './Buttons'
import ClearIcon from '../assets/icons/Clear.svg'


/**
 * Search bar
 *
 * @param {object} startAdornment Child component at start of search bar
 * @param {Function} onSubmit
 * @return {object} The SearchBar react component
 */
export default function InputBar({startAdorment, onSubmit, placeholder}) {
  const [inputText, setInputText] = useState('')
  const onInputChange = (event) => setInputText(event.target.value)
  const searchInputRef = useRef(null)


  return (
    <Box
      sx={{
        'display': 'flex',
        'alignItems': 'center',
        'padding': '2px 2px 2px 2px',
        '& .MuiInputBase-root': {
          flex: 1,
        },
      }}
    >
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '30px',
        height: '30px',
        margin: '5px',
      }}
      >
        {startAdorment}
      </Box>
      <Divider
        sx={{
          height: '36px',
          alignSelf: 'center',
          margin: '0px 10px 0px 0px',
        }}
        orientation='vertical'
        flexItem
      />
      <InputBase
        inputRef={searchInputRef}
        value={inputText}
        onChange={onInputChange}
        error={true}
        multiline
        placeholder={placeholder}
      />
      {inputText.length > 0 ?
        <TooltipIconButton
          title='clear'
          size='small'
          placement='bottom'
          onClick={() => {
            setInputText('')
          }}
          icon={<ClearIcon style={{opacity: '.6'}}/>}
        /> : null
      }
    </Box>
  )
}
