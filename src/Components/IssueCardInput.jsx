import React from 'react'
import Paper from '@mui/material/Paper'
import {grey} from '@mui/material/colors'
import {makeStyles} from '@mui/styles'
import Check from '../assets/2D_Icons/Check.svg'
import Markup from '../assets/2D_Icons/Markup.svg'
import {TooltipIconButton} from './Buttons'
import InputBase from '@mui/material/InputBase'


const sampleText = ` Lorem ipsum dolor sit amet, consectetur adipiscing elit,
sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit
in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
Excepteur sint occaecat cupidatat non proident,
sunt in culpa qui officia deserunt mollit anim id est laborum.`

/**
 * Issue card
 * @param {string} title The comment body
 * @param {string} contetne The comment title, optional
 * @return {Object} React component
 */
export default function IssueCardInput({onSubmit = ()=>{}, title = 'Title', content = sampleText}) {
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
        <div>
          <TooltipIconButton
            title='Mark up'
            size = 'small'
            placement = 'bottom'
            onClick={() => {}}
            icon={<Markup/>}/>
          <TooltipIconButton
            title='Resolve'
            size = 'small'
            placement = 'bottom'
            onClick={() => onSubmit()}
            icon={<Check/>}/>
        </div>
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
    overflow: 'scroll',
    border: '1px solid lightgrey',
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
