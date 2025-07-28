import React, {useState} from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Input from '@mui/material/Input'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import EditIcon from '@mui/icons-material/Edit'
import SubmitIcon from '@mui/icons-material/Done'

/**
 * Editable table row to be used to edit properties
 *
 * @param {object} props Component properties.
 * @param {string} props.heading The non-editable heading displayed in the table row.
 * @param {string} props.subtext The editable content of the table row.
 * @param {('input'|'select')} [props.inputType] The type of input component.
 * @param {Array<string>} [props.options] The options for the select component.
 * @return {object} The rendered component.
 */
export default function CustomTableRow({heading, subtext, inputType = 'input', options = []}) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(subtext)

  const handleSubmit = () => {
    setIsEditing(false)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      handleSubmit()
    }
  }

  const commonStyles = {
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    width: '50%',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  }

  const renderInputComponent = () => {
    if (inputType === 'select') {
      return (
        <Select
          value={value}
          data-testid={'select'}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setIsEditing(false)}
          sx={{
            ...commonStyles,
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: 'transparent',
            },
          }}
        >
          {options.map((option, index) => (
            <MenuItem key={index} value={option}>
              {option}
            </MenuItem>
          ))}
        </Select>
      )
    }

    return (
      <Input
        sx={{...commonStyles, borderBottom: 'none'}}
        disableUnderline
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => setIsEditing(false)}
        onKeyDown={handleKeyDown}
      />
    )
  }

  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      justifyContent="space-between"
      sx={{borderBottom: '1px solid gray'}}
    >
      <Typography variant="body1" sx={commonStyles}>
        {heading}
      </Typography>
      {isEditing ? (
        <>
          {renderInputComponent()}
          <Box sx={{width: '40px'}}>
            <IconButton size="small" onClick={handleSubmit}>
              <SubmitIcon fontSize="inherit" color='primary'/>
            </IconButton>
          </Box>
        </>
      ) : (
        <>
          <Typography variant="body1" sx={commonStyles}>
            {value}
          </Typography>
          <Box sx={{width: '40px'}}>
            <IconButton size="small" onClick={() => setIsEditing(true)}>
              <EditIcon fontSize="inherit" color='primary'/>
            </IconButton>
          </Box>
        </>
      )}
    </Stack>
  )
}
