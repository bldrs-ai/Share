import React, {useState} from 'react'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Input from '@mui/material/Input'
import EditIcon from '@mui/icons-material/Edit'
import SubmitIcon from '@mui/icons-material/Done'

/**
 * Editable table row to be used to edit properties
 *
 * @param {object} props Component properties.
 * @param {string} props.heading The non-editable heading displayed in the table row.
 * @param {string} props.subtext The editable content of the table row.
 * @return {object} The rendered component.
 */
export default function CustomTableRow({heading, subtext}) {
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
         <Input
           sx={{...commonStyles, borderBottom: 'none'}}
           disableUnderline
           value={value}
           onChange={(e) => setValue(e.target.value)}
           onBlur={() => setIsEditing(false)}
           onKeyDown={handleKeyDown} // Add this line to handle Enter key press
         />
         <IconButton size="small" onClick={handleSubmit}>
           <SubmitIcon fontSize="inherit"/>
         </IconButton>
       </>
      ) : (
        <>
          <Typography variant="body1" sx={commonStyles}>
            {value}
          </Typography>
          <IconButton size="small" onClick={() => setIsEditing(true)}>
            <EditIcon fontSize="inherit"/>
          </IconButton>
        </>
      )}
    </Stack>
  )
}
