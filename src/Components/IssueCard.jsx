import React, {useState} from 'react'
import Paper from '@mui/material/Paper'
import {makeStyles} from '@mui/styles'
import Delete from '../assets/2D_Icons/Close.svg'
import Share from '../assets/2D_Icons/Share.svg'
import Check from '../assets/2D_Icons/Check.svg'
import Reply from '../assets/2D_Icons/Reply.svg'
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
export default function IssueCard({expandedImage = false, title = 'Title', content = sampleText, setSelected, selected = false, imageSrc = ''}) {
  const [expandText, setExpandText] = useState(false)
  const [expandImage, setExpandImage] = useState(expandedImage)
  const [select, setSelect] = useState(false)
  const [reply, setReply] = useState(false)
  console.log('image path from card', imageSrc)

  const contentHeight = expandText ? 'auto' : '70px'
  const imageWidth = expandImage ? '100%' : '100px'
  const classes = useStyles({contentHeight: contentHeight, select: select, imageWidth: imageWidth})
  return (
    <Paper
      elevation = {0}
      className = {classes.container}
      style={selected ? {border: '1px solid green'} : {}}
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
      <div className = {classes.imageContainer}>
        {imageSrc.length !=0 &&
        // eslint-disable-next-line
        <div onClick = {() => setExpandImage(!expandImage)}>
          <img
            className = {classes.image}
            alt = 'cardImage'
            src = {imageSrc}/>
        </div>
        }
      </div>
      <div className = {classes.content} style = {content.length < 170 ? {height: 'auto'}:null}>
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
            icon={<Delete/>}/>
          <TooltipIconButton
            title='Share'
            size = 'small'
            placement = 'bottom'
            onClick={() => {}}
            icon={<Share/>}/>
        </div>
      </div>
      {reply ? <IssueCardInput onSubmit = {()=>setReply(false)}/> : null}
    </Paper>
  )
}

const useStyles = makeStyles({
  container: {
    padding: '10px',
    border: (props) => props.select ? '2px solid green':'1px solid lightGrey',
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
})
