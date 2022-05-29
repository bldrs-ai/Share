import React from 'react'
import {makeStyles, useTheme} from '@mui/styles'
import {TooltipIconButton} from './Buttons'
import CloseIcon from '../assets/2D_Icons/Close.svg'
import useStore from '../utils/store'
import ItemProperties from './ItemProperties'
import {CommentPanelAll} from './IssuesControl'


export const CommentsPanel = ()=> {
  const classes = useStyles(useTheme())
  const toggleIsCommentsOn = useStore((state) => state.toggleIsCommentsOn)
  return (
    <>
      <div className = {classes.titleContainer}>
        <div className = {classes.title}>
          Comments
        </div>
        <div>
          <TooltipIconButton
            title='toggle drawer'
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
}))
