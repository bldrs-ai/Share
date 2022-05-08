import React, {useState} from 'react'
import Paper from '@mui/material/Paper'
import {grey} from '@mui/material/colors'
import {makeStyles} from '@mui/styles'
import Delete from '../assets/2D_Icons/Close.svg'
// import Clear from '../assets/2D_Icons/Clear.svg'
import Share from '../assets/2D_Icons/Share.svg'
import Check from '../assets/2D_Icons/Check.svg'
import Reply from '../assets/2D_Icons/Reply.svg'
// import Navigate from '../assets/2D_Icons/Navigate.svg'
import {TooltipIconButton} from './Buttons'
import IssueCardInput from './IssueCardInput'


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
export default function IssueCard({title = 'Title', content = sampleText, setSelected, selected = false}) {
  const [expand, setExpand] = useState(false)
  const [select, setSelect] = useState(false)
  const [reply, setReply] = useState(false)
  const contentHeight = expand ? 'auto' : '70px'
  const cardHeight = expand || reply ? 'auto' : '174px'
  const classes = useStyles({cardHeight: cardHeight, contentHeight: contentHeight, select: select})
  return (
    <Paper
      elevation = {0}
      className = {classes.container}
      style={selected?{border: '1px solid green'}:{}}
    >
      <div className = {classes.title}
        role = 'button'
        onClick = {(e) => {
          select ? setSelect(false) : setSelect(true)
          console.log('in the on click', select)
          setSelected()
        }}
        onKeyPress = {() => {
          select ? setSelect(false):setSelect(true)
        }}
        tabIndex={0}
      >
        <div>
          {title}
        </div>
        <div className = {classes.titleRightContainer}>
          <div className = {classes.select}>{selected?'un-select':'select'}</div>
          <div className = {classes.avatarIcon} style = {{cursor: 'pointer'}}/>
        </div>
      </div>
      <div className = {classes.content}>
        {content}
      </div>
      {content.length>170 ?
      <div className = {classes.showLess}
        onClick = {(event) => {
          event.preventDefault()
          expand ? setExpand(false) : setExpand(true)
        }}
        role = 'button'
        tabIndex={0}
        onKeyPress = {() => expand?setExpand(false):setExpand(true)}
      >
        show{' '}
        {expand ? 'less' : 'more'}
      </div>:
      <div className = {classes.showLessEmpty}/>
      }
      <div className = {classes.actions}>
        <div className = {classes.avatarIconContainer}>
          <div className = {classes.avatarIcon}/>
          <div className = {classes.avatarIcon}
            style = {{
              backgroundColor: 'green',
              position: 'relative',
              right: '10px'}}
          />
        </div>
        <div>
          <TooltipIconButton
            title='Share'
            size = 'small'
            placement = 'bottom'
            onClick={() => {}}
            icon={<Share/>}/>
          <TooltipIconButton
            title='Resolve'
            size = 'small'
            placement = 'bottom'
            onClick={() => {}}
            icon={<Check/>}/>
          <TooltipIconButton
            title='Delete'
            size = 'small'
            placement = 'bottom'
            onClick={() => {}}
            icon={<Delete/>}/>
          <TooltipIconButton
            title='Reply'
            size = 'small'
            placement = 'bottom'
            onClick={()=>setReply(true)}
            icon={<Reply/>}/>
        </div>
      </div>
      {reply ? <IssueCardInput onSubmit = {()=>setReply(false)}/> : null}
    </Paper>
  )
}

const useStyles = makeStyles({
  container: {
    height: (props) => props.cardHeight,
    margin: '10px',
    marginRight: '10px',
    border: (props) => props.select ? '2px solid green':'1px solid lightGrey',
    overflow: 'scroll',
  },
  title: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid lightGrey',
    marginTop: '10px',
    marginBottom: '5px',
    paddingBottom: '5px',
    marginLeft: '5px',
    marginRight: '5px',
    paddingLeft: '5px',
    overflow: 'fix',
    fontSize: '14px',
    fontFamily: 'Helvetica',
    cursor: 'pointer',
  },
  content: {
    height: (props) => props.contentHeight,
    marginTop: '5px',
    marginBottom: '5px',
    marginLeft: '5px',
    marginRight: '5px',
    paddingLeft: '5px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: '12px',
    lineHeight: '14px',
    fontFamily: 'Helvetica',
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
    borderTop: '1px solid lightGrey',
    marginTop: '5px',
    // marginBottom: '5px',
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
  titleRightContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  select: {
    border: '1px solid lightgrey',
    padding: '2px 4px 2px 4px',
    borderRadius: '6px',
    marginRight: '10px',
  },
})
