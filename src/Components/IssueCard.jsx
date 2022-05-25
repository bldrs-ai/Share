import React, {useState} from 'react'
import Paper from '@mui/material/Paper'
import {makeStyles} from '@mui/styles'
import {TooltipIconButton} from './Buttons'
import Share from '../assets/2D_Icons/Share.svg'


const placeholderText = '...'
/**
 * Issue card
 * @param {string} title The comment body
 * @param {string} contetne The comment title, optional
 * @return {Object} React component
 */
export default function IssueCard({
  title = 'Title',
  content = placeholderText,
  selected = false,
}) {
  const [expandText, setExpandText] = useState(false)
  const contentHeight = expandText ? 'auto' : '70px'
  const classes = useStyles({contentHeight: contentHeight})
  return (
    <Paper
      elevation = {0}
      className = {classes.container}
    >
      <div className = {classes.title}>
        <div>
          {title}
        </div>
        <div className = {classes.titleRightContainer}>
          <div className = {classes.avatarIcon}/>
        </div>
      </div>
      <div className = {classes.content} style = {content.length < 170 ? {height: 'auto'} : null}>
        {content}
      </div>
      {content.length> 170 ?
      <div className = {classes.showLess}
        onClick = {(event) => {
          event.preventDefault()
          expandText ? setExpandText(false) : setExpandText(true)
        }}
        role = 'button'
        tabIndex={0}
        onKeyPress = {() => expandText ? setExpandText(false) : setExpandText(true)}
      >
        show{' '}
        {expandText ? 'less' : 'more'}
      </div> :
      <div className = {classes.showLessEmpty}/>
      }
      <div className = {classes.actions}>
        <div className = {classes.avatarIconContainer}>
          <div className = {classes.avatarIcon}
            style = {{
              backgroundColor: 'lime'}}
          />
          <div className = {classes.avatarIcon}
            style = {{
              backgroundColor: 'DimGray',
              position: 'relative',
              right: '14px'}}
          />
        </div>
        <div>
          <TooltipIconButton
            title='Share'
            size = 'small'
            placement = 'bottom'
            onClick={() => {}}
            icon={<Share/>}/>
        </div>
      </div>
    </Paper>
  )
}

const useStyles = makeStyles({
  container: {
    padding: '10px',
    border: '1px solid lightGrey',
    width: '270px',
    marginBottom: '20px',
    marginLeft: '10px',
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
    color: '#70AB32',
  },
  showLessEmpty: {
    marginTop: '5px',
    border: `1px solid transparent`,
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
    marginLeft: '5px',
    marginRight: '5px',
    paddingLeft: '5px',
    paddingTop: '5px',
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
    width: 18,
    height: 19,
    borderRadius: '50%',
    backgroundColor: 'grey',
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
    cursor: 'pointer',
  },
  image: {
    borderRadius: '10px',
    border: '1px solid #DCDCDC',
    cursor: 'pointer',
  },
  imageContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
