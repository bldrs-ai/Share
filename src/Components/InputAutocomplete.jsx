import React from 'react'
import Paper from '@mui/material/Paper'
import Autocomplete from '@mui/material/Autocomplete'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import HighlightOffIcon from '@mui/icons-material/HighlightOff'
import useTheme from '@mui/styles/useTheme'


/**
 * InputAutocomplete Component.
 *
 * @param {string} inputText - The input text value.
 * @param {Function} setInputText - Function to set the input text.
 * @param {string} error - The error message.
 * @param {Function} onClear - Function to be executed when the clear button is clicked.
 * @param {Array<string>} options - Array of options for the autocomplete.
 * @param {React.ReactNode} startAdornment - Start adornment for the input.
 * @param {string} placeholder - Placeholder text for the input.
 * @return {React.Component}
 */
function InputAutocomplete({
  inputText,
  setInputText,
  error = '', // Set default value
  onClear,
  options = [],
  startAdornment = null,
  placeholder = '',
}) {
  const theme = useTheme()

  return (
    <Paper elevation={1} variant='control'>
      <Autocomplete
        fullWidth
        freeSolo
        options={options}
        value={inputText}
        onChange={(_, newValue) => setInputText(newValue || '')}
        onInputChange={(_, newInputValue) => setInputText(newInputValue || '')}
        inputValue={inputText}
        PaperComponent={({children}) => (
          <Paper
            sx={{
              'backgroundColor': theme.palette.scene.background,
              '.MuiAutocomplete-option': {
                backgroundColor: theme.palette.scene.background,
              },
            }}
          >
            {children}
          </Paper>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            error={!!error.length}
            placeholder={placeholder}
            variant="outlined"
            sx={{
              'width': '100%',
              'border': 'none',
              '& fieldset': {
                border: 'none',
              },
              '&:hover fieldset': {
                border: 'none',
              },
              '&.Mui-focused fieldset': {
                border: 'none',
              },
              '& .MuiOutlinedInput-root': {
                border: 'none',
                height: '46px',
              },
            }}
            InputProps={{
              ...params.InputProps,
              startAdornment: startAdornment,
              endAdornment: inputText.length > 0 ? (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={onClear}
                  style={{padding: 0, opacity: 0.8}}
                >
                  <HighlightOffIcon
                    className="icon-share"
                    sx={{opacity: 0.8}}
                    size="inherit"
                    color="secondary"
                  />
                </IconButton>
              </InputAdornment>
            ) : null,
            }}
          />
        )}
      />
    </Paper>
  )
}

export default InputAutocomplete
