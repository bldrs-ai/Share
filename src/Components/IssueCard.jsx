import React, {useState} from 'react'
import Paper from '@mui/material/Paper'
import {makeStyles} from '@mui/styles'
import Select from '../assets/2D_Icons/Select.svg'
import Share from '../assets/2D_Icons/Share.svg'
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
  expandedImage = false,
}) {
  const [expandText, setExpandText] = useState(false)
  const [expandImage, setExpandImage] = useState(expandedImage)
  const selectedComment = useStore((state) => state.selectedComment)
  const setSelectedComment = useStore((state) => state.setSelectedComment)
  const selected = selectedComment === id

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
          <div className = {classes.select}>
            <TooltipIconButton
              title={selected ? 'Unselect Comment':'Select Comment'}
              size = 'small'
              placement = 'bottom'
              onClick = {() => {
                selected ? setSelectedComment(null) : setSelectedComment(id)
              }}
              icon={<Select/>}/>
          </div>
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
          {/* <TooltipIconButton
            title='Reply'
            size = 'small'
            placement = 'bottom'
            onClick={()=>setReply(!reply)}
            icon={<Reply/>}/>
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
            icon={<Delete/>}/> */}
          <TooltipIconButton
            title='Share'
            size = 'small'
            placement = 'bottom'
            onClick={() => {}}
            icon={<Share/>}/>
        </div>
      </div>
      {/* {reply ? <IssueCardInput onSubmit = {()=>setReply(false)}/> : null} */}
    </Paper>
  )
}

const useStyles = makeStyles({
  container: {
    padding: '10px',
    border: (props) => props.select ? '1px solid green':'1px solid lightGrey',
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
  body: {
    height: (props) => props.bodyHeight,
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
