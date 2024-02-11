import React, {useState} from 'react'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'


/**
 * Menu with items for delete and edit
 *
 * @property {Function} onDeleteClick Callback for delete
 * @property {Function} onEditClick Callback for eddit
 * @return {React.ReactElement}
 */
export default function NoteMenu({onDeleteClick, onEditClick}) {
  const [anchorEl, setAnchorEl] = useState(null)
  return (
    <>
      <Tooltip title='Edit or delete' placement='left'>
        <IconButton
          onClick={(event) => setAnchorEl(event.currentTarget)}
          aria-controls='simple-menu'
          aria-haspopup='true'
          data-testid='note-menu-button'
        >
          <MoreVertIcon className='icon-share'/>
        </IconButton>
      </Tooltip>
      <Menu
        elevation={1}
        id='basic-menu'
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{vertical: 'top', horizontal: 'center'}}
        transformOrigin={{vertical: 'top', horizontal: 'center'}}
        PaperProps={{
          style: {
            left: '200px',
            transform: 'translateX(-70px) translateY(0px)',
          },
        }}
        data-testid='note-menu'
      >
        <MenuItem
          onClick={() => {
            onEditClick()
            setAnchorEl(null)
          }}
        >
          <EditOutlinedIcon/>
          <Typography variant='overline' sx={{marginLeft: '10px'}}>Edit</Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            onDeleteClick()
            setAnchorEl(null)
          }}
        >
          <DeleteOutlineOutlinedIcon/>
          <Typography variant='overline' sx={{marginLeft: '10px'}}>Delete</Typography>
        </MenuItem>
      </Menu>
    </>

  )
}
