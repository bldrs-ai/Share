import React from 'react'
import ReactMarkdown from 'react-markdown'
import CardContent from '@mui/material/CardContent'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import {TooltipIconButton} from '../Buttons'
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'


export const CardMenu = ({
  handleMenuClick,
  handleMenuClose,
  anchorEl,
  actviateEditMode,
  deleteNote,
  noteNumber,
  open,
}) => {
  return (
    <>
      <TooltipIconButton
        title={'Note Actions'}
        placement='left'
        icon={<MoreVertIcon className='icon-share'/>}
        onClick={handleMenuClick}
      />
      <Menu
        elevation={1}
        id='basic-menu'
        anchorEl={anchorEl}
        open={open}
        onClose={handleMenuClose}
        anchorOrigin={{vertical: 'top', horizontal: 'center'}}
        transformOrigin={{vertical: 'top', horizontal: 'center'}}
        PaperProps={{
          style: {
            left: '200px',
            transform: 'translateX(-70px) translateY(0px)',
          },
        }}
      >
        <MenuItem onClick={actviateEditMode}>
          <EditOutlinedIcon/>
          <Typography variant='overline' sx={{marginLeft: '10px'}}>Edit</Typography>
        </MenuItem>
        <MenuItem onClick={() => deleteNote(noteNumber)}>
          <DeleteOutlineOutlinedIcon/>
          <Typography sx={{marginLeft: '10px'}} variant='overline'>Delete</Typography>
        </MenuItem>
      </Menu>
    </>

  )
}


export const SelectedCardBody = ({editBody}) => {
  return (
    <CardContent>
      <ReactMarkdown>
        {editBody}
      </ReactMarkdown>
    </CardContent>
  )
}


export const CommentCardBody = ({editBody}) => {
  return (
    <CardContent>
      <ReactMarkdown>
        {editBody}
      </ReactMarkdown>
    </CardContent>
  )
}

