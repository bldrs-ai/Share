import React from 'react'
import {makeStyles, useTheme} from '@mui/styles'
import useStore from '../utils/store'
import ItemProperties from './ItemProperties'
import CloseIcon from '../assets/2D_Icons/Close.svg'
import Next from '../assets/2D_Icons/NavNext.svg'
import Previous from '../assets/2D_Icons/NavPrev.svg'
import Back from '../assets/2D_Icons/Back.svg'
import {TooltipIconButton} from './Buttons'
import {CommentPanelAll} from './IssuesControl'


export const CommentsPanel = ()=> {
  const classes = useStyles(useTheme())
  const toggleIsCommentsOn = useStore((state) => state.toggleIsCommentsOn)
  const selectedCommentId = useStore((state) => state.selectedCommentId)
  const setSelectedComment = useStore((state) => state.setSelectedComment)
  const setSelectedCommentIndex = useStore((state) => state.setSelectedCommentIndex)
  const selectedCommentIndex = useStore((state) => state.selectedCommentIndex)
  const issues = useStore((state) => state.issues)

  const selectPreviousIssue = () => {
    const previousCommentIndex = selectedCommentIndex-1
    if (previousCommentIndex >= 0) {
      const previousIssue = issues.filter((issue)=>issue.index === previousCommentIndex)[0]
      setSelectedComment(previousIssue.id)
      setSelectedCommentIndex(previousIssue.index)
    }
  }
  const selectNextIssue = () => {
    const nextCommentIndex = selectedCommentIndex+1
    if (nextCommentIndex < issues.length) {
      const nextIssue = issues.filter((issue)=>issue.index === nextCommentIndex)[0]
      setSelectedComment(nextIssue.id)
      setSelectedCommentIndex(nextIssue.index)
    }
  }

  return (
    <>
      <div className = {classes.titleContainer}>
        <div className = {classes.leftGroup}>
          <div className = {classes.title}>
            {!selectedCommentId ? 'Notes': 'Topic' }
          </div>
          {!selectedCommentId ?
          <div className = {classes.notifications}>
            1
          </div>:null}
        </div>
        <div className = {classes.rightGroup}>
          <div className = {classes.controls} >
            {selectedCommentId &&
            <>
              <TooltipIconButton
                title='Back to the list'
                placement = 'bottom'
                size = 'small'
                onClick={()=>setSelectedComment(null)}
                icon={<Back style = {{width: '30px', height: '30px'}}/>}/>
              <>
                <TooltipIconButton
                  title='Previous Comment'
                  placement = 'bottom'
                  size = 'small'
                  onClick={selectPreviousIssue}
                  icon={<Previous style = {{width: '20px', height: '20px'}}/>}/>
                <TooltipIconButton
                  title='Next Comment'
                  size = 'small'
                  placement = 'bottom'
                  onClick={selectNextIssue}
                  icon={<Next style = {{width: '20px', height: '20px'}}/>}/>
              </>
            </>
            }
          </div>
          <TooltipIconButton
            title='Close Comments'
            placement = 'bottom'
            onClick={toggleIsCommentsOn}
            icon={<CloseIcon style = {{width: '24px', height: '24px'}}/>}/>
        </div>
      </div>
      <div className = {classes.contentContainer}>
        <CommentPanelAll/>
      </div>
    </>
  )
}

export const PropertiesPanel = ()=> {
  const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  const classes = useStyles(useTheme())
  return (
    <>
      <div className = {classes.titleContainer}>
        <div className = {classes.title}>
          Properties
        </div>
        <div>
          <TooltipIconButton
            title='toggle drawer'
            onClick={toggleIsPropertiesOn}
            icon={<CloseIcon style = {{width: '24px', height: '24px'}}/>}/>
        </div>
      </div>
      <div className = {classes.contentContainer}>
        <ItemProperties />
      </div>
    </>
  )
}


const useStyles = makeStyles(() => ({
  titleContainer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: '10px',
    borderRadius: '5px',
    background: '#7EC43B',
  },
  title: {
    // width: '100%',
    height: '30px',
    display: 'flex',
    fontSize: '18px',
    textDecoration: 'underline',
    fontWeight: 'bold',
    marginRight: '10px',
    paddingLeft: '2px',
    alignItems: 'center',
  },
  contentContainer: {
    marginTop: '10px',
    height: '100%',
    overflow: 'scroll',
    paddingBottom: '30px',
  },
  controls: {
    height: '100%',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rightGroup: {
    width: '160px',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  leftGroup: {
    width: '100px',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  container: {
    background: '#7EC43B',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notifications: {
    width: '19px',
    height: '20px',
    border: '1px solid lime',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '10px',
    color: 'black',
    borderRadius: '20px',
  },
}))
