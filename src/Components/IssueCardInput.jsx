import React from 'react'
import Paper from '@mui/material/Paper'
import {grey} from '@mui/material/colors'
import {makeStyles} from '@mui/styles'
import Check from '../assets/2D_Icons/Check.svg'
import Markup from '../assets/2D_Icons/Markup.svg'
import Camera from '../assets/2D_Icons/Camera.svg'
import Image from '../assets/2D_Icons/Image.svg'
import ScreenShot from '../assets/2D_Icons/ScreenShot.svg'
import {TooltipToggleButton} from './Buttons'
import InputBase from '@mui/material/InputBase'


/**
 * Issue card
 * @param {string} title The comment body
 * @param {string} contetne The comment title, optional
 * @return {Object} React component
 */
export default function IssueCardInput({onSubmit = ()=>{}}) {
  const classes = useStyles()
  return (
    <Paper elevation = {0} className = {classes.container}>
      <div className = {classes.title}>
        <InputBase
          id="outlined-basic"
          label="Title"
          type="text"
          placeholder = 'Title'
          size="small"/>
      </div>
      <div className = {classes.content}>
        <InputBase
          id="outlined-basic"
          label="fkj "
          type="text"
          placeholder = 'Comment body'
          multiline
          rows = {3}
          size="small"/>
      </div>
      <div className = {classes.actions}>
        <TooltipToggleButton
          title='Include Camera View'
          size = 'small'
          placement = 'bottom'
          onClick={() => {}}
          icon={<Camera/>}/>
        <TooltipToggleButton
          title='Include Model Screen Shot'
          size = 'small'
          placement = 'bottom'
          onClick={() => {}}
          icon={<ScreenShot/>}/>
        <TooltipToggleButton
          title='Upload Image'
          size = 'small'
          placement = 'bottom'
          onClick={() => {}}
          icon={<Image/>}/>
        <TooltipToggleButton
          title='Mark up mode'
          size = 'small'
          placement = 'bottom'
          onClick={() => {}}
          icon={<Markup/>}/>
        <TooltipToggleButton
          title='Submit'
          size = 'small'
          placement = 'bottom'
          onClick={()=>onSubmit()}
          icon={<Check/>}/>
      </div>
    </Paper>
  )
}

const useStyles = makeStyles({
  container: {
    height: 'auto',
    width: 'auto',
    margin: '10px',
    marginRight: '10px',
    border: '1px solid transparent',
  },
  title: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '10px',
    marginBottom: '10px',
    marginLeft: '5px',
    marginRight: '5px',
    paddingLeft: '10px',
    height: '40px',
    overflow: 'fix',
    fontSize: '14px',
    fontFamily: 'Helvetica',
    cursor: 'pointer',
    border: '1px solid lightGrey',
    borderRadius: '10px',
  },
  content: {
    height: '100px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginTop: '10px',
    marginBottom: '5px',
    marginLeft: '5px',
    marginRight: '5px',
    paddingLeft: '5px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: '12px',
    lineHeight: '14px',
    fontFamily: 'Helvetica',
    border: '1px solid lightGrey',
    borderRadius: '10px',
  },
  showLess: {
    cursor: 'pointer',
    marginTop: '5px',
    marginBottom: '5px',
    marginLeft: '5px',
    marginRight: '5px',
    paddingLeft: '5px',
    overflow: 'fix',
    fontSize: '10px',
    color: 'blue',
  },
  showLessEmpty: {
    marginTop: '5px',
    border: `1px solid ${grey[100]}`,
    height: '12px',
    widht: '10px',
    marginBottom: '5px',
    marginLeft: '5px',
    marginRight: '5px',
    paddingLeft: '5px',
    overflow: 'fix',
    fontSize: '10px',
    color: 'blue',
  },
  actions: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '5px',
    marginLeft: '5px',
    marginRight: '5px',
    paddingLeft: '5px',
    overflow: 'fix',
    fontSize: '10px',
  },
  avatarIconContainer: {
    width: '50px',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  avatarIcon: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    backgroundColor: 'blue',
  },
})
