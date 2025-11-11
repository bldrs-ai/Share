import React, {ReactElement, useState} from 'react'
import {IconButton, Menu, MenuItem, Tooltip, Typography} from '@mui/material'
import {
  DeleteOutlineOutlined as DeleteOutlineOutlinedIcon,
  EditOutlined as EditOutlinedIcon,
  MoreVert as MoreVertIcon,
} from '@mui/icons-material'


/**
 * Menu with items for delete and edit
 *
 * @property {Function} onDeleteClick Callback for delete
 * @property {Function} onEditClick Callback for eddit
 * @return {ReactElement}
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
