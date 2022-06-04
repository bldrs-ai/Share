import React, {useState, useEffect} from 'react'
import Paper from '@mui/material/Paper'
import {makeStyles} from '@mui/styles'
import Select from '../assets/2D_Icons/Select.svg'
import Back from '../assets/2D_Icons/Back.svg'
import Navigate from '../assets/2D_Icons/Navigate.svg'
import {TooltipIconButton} from './Buttons'
import useStore from '../utils/store'


/**
 * Issue card
 * @param {string} title The comment body
 * @param {string} contetne The comment title, optional
 * @return {Object} React component
 */
export default function IssueCard({
  cameraPosition=null,
  id,
  title = 'Title',
  date,
  body,
  avatarURL,
  username,
  imageURL = '',
  numberOfReplies = null,
  expandedImage = true,
  index = null,
  camera = null,
}) {
  const [expandText, setExpandText] = useState(false)
  const [expandImage, setExpandImage] = useState(expandedImage)
  const selectedCommentId = useStore((state) => state.selectedCommentId)
  const setSelectedCommentIndex = useStore((state) => state.setSelectedCommentIndex)
  const setSelectedComment = useStore((state) => state.setSelectedComment)
  const selected = selectedCommentId === id

  const bodyHeight = expandText ? 'auto' : '64px'
  const imageWidth = expandImage ? '96%' : '100px'
  const classes = useStyles({bodyHeight: bodyHeight, select: selected, imageWidth: imageWidth})
  useEffect(()=>{
    if (selected && cameraPosition) {
      window.location.hash = cameraPosition
    }
  }, [selected, cameraPosition])
  return (
    <Paper
      elevation = {0}
      className = {classes.container}
      style = {{borderRadius: '5px'}}
    >
      <div className = {classes.titleContainer}>
        <div className = {classes.title}>
          <div style = {{width: '170px'}}>{title}</div>
          <div className = {classes.username}>{date.split('T')[0]}</div>
        </div>
        <div className = {classes.titleRightContainer}>
          {!selected &&
          <div className = {classes.select}>
            <TooltipIconButton
              title={selected ? 'Back to the list':'Select Comment'}
              size = 'small'
              placement = 'bottom'
              onClick = {() => {
                selected ? setSelectedCommentIndex(null) : setSelectedCommentIndex(index)
                selected ? setSelectedComment(null) : setSelectedComment(id)
              }}
              icon={selected ? <Back style = {{width: '24px', height: '24px'}} /> : <Select />}/>
          </div>
          }
          <img alt = {'avatarImage'} className = {classes.avatarIcon} src = {avatarURL}/>
        </div>
      </div>
      {imageURL.length !=0 &&
      <div className = {classes.imageContainer}
        onClick = {() => setExpandImage(!expandImage)}
        role = 'button'
        tabIndex={0}
        onKeyPress = {() => setExpandImage(!expandImage)}>
        <img
          className = {classes.image}
          alt = 'cardImage'
          src = {imageURL}/>
      </div>
      }
      <div className = {classes.body} style = {body.length < 170 ? {height: 'auto'} : null}>
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
          onClick={() => {
            if (cameraPosition) {
              window.location.hash = cameraPosition
            }
          }}
          icon={<Navigate style = {{width: '26px', height: '26px', backgroundColor: '#7EC43B', color: 'black'}}/>}/>
        <div className = {classes.repliesIconContainer}
          role = 'button'
          tabIndex={0}
          onClick = {() => {
            setSelectedCommentIndex(index)
            setSelectedComment(id)
          }}
          onKeyPress = {() => {
            setSelectedCommentIndex(index)
            setSelectedComment(id)
          }}
        >
          {numberOfReplies>0 ?
            <div className = {classes.repliesIndicator} > {numberOfReplies} </div>:
            <div className = {classes.repliesIndicator} style = {{background: 'white'}}> {numberOfReplies} </div>
          }
        </div>
      </div>
    </Paper>
  )
}

const useStyles = makeStyles({
  container: {
    padding: '4px',
    border: (props) => props.select ? '1px solid green':'1px solid lightGrey',
    width: '270px',
    marginBottom: '20px',
  },
  titleContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid lightGrey',
    marginTop: '6px',
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
  title: {
    marginTop: '5px',
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
    fontSize: '1em',
    lineHeight: '1.3em',
    fontFamily: 'Roboto',
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
  repliesIconContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: '10px',
    marginBottom: '10px',
    marginRight: '6px',
  },
  avatarIcon: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    backgroundColor: 'lightGrey',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: 'bold',
    border: '1px solid lightGrey',
  },
  repliesIndicator: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    backgroundColor: 'lightGrey',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: 'bold',
    color: 'black',
    cursor: 'pointer',
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
