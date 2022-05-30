import React from 'react'
import {makeStyles, useTheme} from '@mui/styles'
import useStore from '../utils/store'
import ItemProperties from './ItemProperties'
import CloseIcon from '../assets/2D_Icons/Close.svg'
import Next from '../assets/2D_Icons/NavNext.svg'
import Previous from '../assets/2D_Icons/NavPrev.svg'
import {TooltipIconButton} from './Buttons'
import {CommentPanelAll} from './IssuesControl'


export const CommentsPanel = ()=> {
  const classes = useStyles(useTheme())
  const toggleIsCommentsOn = useStore((state) => state.toggleIsCommentsOn)
  const selectedCommentId = useStore((state) => state.selectedCommentId)
  return (
    <>
      <div className = {classes.titleContainer}>
        <div className = {classes.title}>
          Comments
        </div>
        <div style = {{width: '160px', display: 'flex', flexDirection: 'row', justifyContent: 'space-between'}}>
          <div className = {classes.controls} >
            {selectedCommentId &&
              <>
                <TooltipIconButton
                  title='Previous Comment'
                  placement = 'bottom'
                  size = 'small'
                  onClick={()=>{}}
                  icon={<Previous style = {{width: '20px', height: '20px'}}/>}/>
                <TooltipIconButton
                  title='Next Comment'
                  size = 'small'
                  placement = 'bottom'
                  onClick={()=>{}}
                  icon={<Next style = {{width: '20px', height: '20px'}}/>}/>
              </>
            }
          </div>
          <TooltipIconButton
            title='Close Comments'
            placement = 'bottom'
            onClick={toggleIsCommentsOn}
            icon={<CloseIcon/>}/>
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
            icon={<CloseIcon/>}/>
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
    paddingLeft: '10px',
    borderRadius: '5px',
    background: 'Gainsboro',
  },
  title: {
    width: '100%',
    height: '50px',
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
  },
  controls: {
    height: '100%',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
}))
