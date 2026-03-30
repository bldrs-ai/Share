import React, {ReactElement, useEffect, useRef, useState} from 'react'
import {Divider, IconButton, MenuItem, Stack, TextField, Typography} from '@mui/material'
import {Close as ClearIcon} from '@mui/icons-material'
import {disablePageReloadApprovalCheck} from '../../utils/event'


const DEBOUNCE_MS = 300
const OTHER_VALUE = '__other__'


/**
 * @property {string} label component title
 * @property {boolean|string|number} selected selected component control the selected value of the component
 * @property {Function} setSelected callback to select the element; receives index (number) from dropdown or string from Other... mode
 * @property {Array} list list of elements to populate select options
 * @property {Function} [validate] Optional async fn (value: string) => boolean. When provided, adds "Other..." option.
 * @property {string} [data-testid] id for testing
 * @return {ReactElement}
 */
export default function Selector({
  label,
  selected,
  setSelected,
  list,
  validate,
  ...props
}) {
  const [isTextMode, setIsTextMode] = useState(false)
  const [inputText, setInputText] = useState('')
  const [validationStatus, setValidationStatus] = useState('idle')
  const debounceRef = useRef(null)
  const textInputRef = useRef(null)

  const handleSelect = (e) => {
    if (e.target.value === OTHER_VALUE) {
      setIsTextMode(true)
      setInputText('')
      setValidationStatus('idle')
      return
    }
    disablePageReloadApprovalCheck()
    setSelected(e.target.value)
  }

  const handleTextChange = (e) => {
    const value = e.target.value
    setInputText(value)
    setValidationStatus('idle')

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    if (!value.trim()) {
      return
    }
    setValidationStatus('checking')
    debounceRef.current = setTimeout(async () => {
      try {
        const found = await validate(value.trim())
        setValidationStatus(found ? 'found' : 'no-match')
      } catch {
        setValidationStatus('no-match')
      }
    }, DEBOUNCE_MS)
  }

  const handleAccept = () => {
    if (validationStatus === 'found') {
      disablePageReloadApprovalCheck()
      setValidationStatus('idle')
      setSelected(inputText.trim())
    }
  }

  const handleClear = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    setIsTextMode(false)
    setInputText('')
    setValidationStatus('idle')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleAccept()
    } else if (e.key === 'Escape') {
      handleClear()
    }
  }

  const handleBlur = () => {
    if (validationStatus === 'found') {
      handleAccept()
    }
  }

  useEffect(() => {
    if (isTextMode) {
      textInputRef.current?.focus()
    }
  }, [isTextMode])

  useEffect(() => () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
  }, [])

  if (isTextMode) {
    let statusColor = 'text.secondary'
    let statusText = null
    if (validationStatus === 'checking') {
      statusText = 'Checking...'
    } else if (validationStatus === 'found') {
      statusColor = 'success.main'
      statusText = 'Found'
    } else if (validationStatus === 'no-match') {
      statusColor = 'error.main'
      statusText = 'No match'
    }

    return (
      <Stack sx={{marginBottom: '.5em', width: '100%'}}>
        <TextField
          inputRef={textInputRef}
          value={inputText}
          variant='outlined'
          label={label}
          size='small'
          sx={{
            'width': '100%',
            '& .MuiOutlinedInput-root': {paddingRight: '6px'},
          }}
          InputProps={{
            endAdornment: (
              <IconButton
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleClear}
                data-testid={`selector-clear-${label.toLowerCase()}`}
                sx={{width: '28px', height: '28px', padding: 0, margin: 0}}
              >
                <ClearIcon fontSize='small'/>
              </IconButton>
            ),
          }}
          {...props}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
        {statusText && (
          <Typography variant='caption' sx={{color: statusColor, ml: 1, mt: 0.25}}>
            {statusText}
          </Typography>
        )}
      </Stack>
    )
  }

  return (
    <TextField
      value={selected}
      onChange={(e) => handleSelect(e)}
      variant='outlined'
      label={label}
      select
      size='small'
      sx={{
        'width': '100%',
        'marginBottom': '.5em',
        '& .MuiSelect-select': {textAlign: 'left'},
      }}
      {...props}
    >
      {validate && [
        <MenuItem key='other' value={OTHER_VALUE}>
          <Typography variant='p'>Enter name...</Typography>
        </MenuItem>,
        <Divider key='divider'/>,
      ]}
      {list.map((listMember, i) => (
        <MenuItem key={i} value={i}><Typography variant='p'>{listMember}</Typography></MenuItem>
      ))}
    </TextField>
  )
}
