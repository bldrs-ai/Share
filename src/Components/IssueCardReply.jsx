import React, {useState} from 'react'
import Paper from '@mui/material/Paper'
import {makeStyles} from '@mui/styles'
import Share from '../assets/2D_Icons/Share.svg'
import Navigate from '../assets/2D_Icons/Navigate.svg'
// import Delete from '../assets/2D_Icons/Close.svg'
// import Check from '../assets/2D_Icons/Check.svg'
// import Reply from '../assets/2D_Icons/Reply.svg'
import {TooltipIconButton} from './Buttons'
import useStore from '../utils/store'


/**
 * Issue card
 * @param {string} title The comment body
 * @param {string} contetne The comment title, optional
 * @return {Object} React component
 */
export default function IssueCard({
  id,
  title = 'Title',
  body,
  avatarURL,
  username,
  imageURL = '',
  numberOfReplies = null,
  expandedImage = false,
}) {
  const [expandText, setExpandText] = useState(false)
  const [expandImage, setExpandImage] = useState(expandedImage)
  const selectedCommentId = useStore((state) => state.selectedCommentId)
  const selected = selectedCommentId === id

  const bodyHeight = expandText ? 'auto' : '70px'
  const imageWidth = expandImage ? '100%' : '100px'
  const classes = useStyles({bodyHeight: bodyHeight, select: selected, imageWidth: imageWidth})

  return (
    <Paper
      elevation = {0}
      className = {classes.container}
      style = {{borderRadius: '10px'}}
    >
      <div className = {classes.title}>
        <div>
          <div>{title}</div>
          <div className = {classes.username}>{username}</div>
        </div>
        <div className = {classes.titleRightContainer}>
          <img alt = {'avatarImage'} className = {classes.avatarIcon} src = {avatarURL}/>
        </div>
      </div>
      <div className = {classes.imageContainer}>
        {imageURL.length !=0 &&
        // eslint-disable-next-line
        <div onClick = {() => setExpandImage(!expandImage)}>
          <img
            className = {classes.image}
            alt = 'cardImage'
            src = {imageURL}/>
        </div>
        }
      </div>
      <div className = {classes.body} style = {body.length < 170 ? {height: 'auto'}:null}>
        {body}
      </div>
      {body.length> 170 ?
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
        <TooltipIconButton
          title='Show the camera view'
          size = 'small'
          placement = 'bottom'
          onClick={() => {}}
          icon={<Navigate/>}/>
        <TooltipIconButton
          title='Share'
          size = 'small'
          placement = 'bottom'
          onClick={() => {}}
          icon={<Share/>}/>
      </div>
    </Paper>
  )
}

const useStyles = makeStyles({
  container: {
    padding: '10px',
    border: '1px solid green',
    width: '250px',
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
    fontSize: '1em',
    lineHeight: '1.1em',
    fontFamily: 'Helvetica',
  },
  body: {
    height: (props) => props.bodyHeight,
    marginTop: '5px',
    marginBottom: '5px',
    marginLeft: '5px',
    marginRight: '5px',
    paddingLeft: '5px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: '.9em',
    lineHeight: '1.2em',
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
    display: 'flex',
    flexDirection: 'row',
    justifyContent: '',
    alignItems: 'center',
  },
  avatarIcon: {
    width: 18,
    height: 19,
    borderRadius: '50%',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: 'bold',
  },
  titleRightContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  select: {
    borderRadius: '6px',
    cursor: 'pointer',
    marginRight: '2px',
  },
  image: {
    width: (props) => props.imageWidth,
    borderRadius: '10px',
    border: '1px solid #DCDCDC',
    cursor: 'pointer',
  },
  imageContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  username: {
    fontSize: '10px',
  },
})
