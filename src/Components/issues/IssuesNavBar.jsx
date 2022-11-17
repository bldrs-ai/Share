import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {makeStyles, useTheme} from '@mui/styles'
import {addHashParams, removeHashParams} from '../../utils/location'
import useStore from '../../store/useStore'
import {TooltipIconButton} from '../Buttons'
import {setCameraFromParams, addCameraUrlParams, removeCameraUrlParams} from '../CameraControl'
import {ISSUE_PREFIX} from './Issues'
import BackIcon from '../../assets/2D_Icons/Back.svg'
import CloseIcon from '../../assets/2D_Icons/Close.svg'
import NextIcon from '../../assets/2D_Icons/NavNext.svg'
import PreviousIcon from '../../assets/2D_Icons/NavPrev.svg'
import AddNote from '../../assets/2D_Icons/AddNote.svg'


/** @return {object} React component. */
export default function IssuesNavBar() {
  const classes = useStyles(useTheme())
  const issues = useStore((state) => state.issues)
  const selectedIssueId = useStore((state) => state.selectedIssueId)
  const setSelectedIssueId = useStore((state) => state.setSelectedIssueId)
  const selectedIssueIndex = useStore((state) => state.selectedIssueIndex)
  const setSelectedIssueIndex = useStore((state) => state.setSelectedIssueIndex)
  const turnCommentsOff = useStore((state) => state.turnCommentsOff)
  const isAddNote = useStore((state) => state.isAddNote)
  const toggleIsAddNote = useStore((state) => state.toggleIsAddNote)
  const selectIssue = (direction) => {
    const index = direction === 'next' ? selectedIssueIndex + 1 : selectedIssueIndex - 1
    if (index >= 0 && index < issues.length) {
      const issue = issues.filter((i) => i.index === index)[0]
      setSelectedIssueId(issue.id)
      setSelectedIssueIndex(issue.index)
      addHashParams(window.location, ISSUE_PREFIX, {id: issue.id})
      if (issue.url) {
        setCameraFromParams(issue.url)
        addCameraUrlParams()
      } else {
        removeCameraUrlParams()
      }
    }
  }


  return (
    <div className={classes.titleContainer}>
      <div className={classes.leftGroup}>
        <Typography variant='h2'>
          {!selectedIssueId && 'Notes' }
        </Typography>

        {selectedIssueId ?
          <Box>
            <TooltipIconButton
              title='Back to the list'
              placement='bottom'
              onClick={() => {
                removeHashParams(window.location, ISSUE_PREFIX)
                setSelectedIssueId(null)
              }}
              icon={<BackIcon/>}
            />
          </Box> : null
        }
      </div>

      <div className={classes.middleGroup} >
        {(issues && selectedIssueId) && issues.length > 1 &&
          <>
            <TooltipIconButton
              title='Previous Note'
              placement='bottom'
              size='small'
              onClick={() => selectIssue('previous')}
              icon={<PreviousIcon/>}
            />
            <TooltipIconButton
              title='Next Note'
              size='small'
              placement='bottom'
              onClick={() => selectIssue('next')}
              icon={<NextIcon/>}
            />
          </>
        }
      </div>

      <div className={classes.rightGroup}>
        {isAddNote ?
        <TooltipIconButton
          title='Back to the list'
          placement='bottom'
          onClick={toggleIsAddNote}
          icon={<BackIcon/>}
        /> :
        <TooltipIconButton
          title='Add new note'
          placement='bottom'
          onClick={toggleIsAddNote}
          icon={<AddNote/>}
        />
        }
        <TooltipIconButton
          title='Close Comments'
          placement='bottom'
          onClick={turnCommentsOff}
          icon={<div className={classes.iconContainerClose}><CloseIcon/></div>}
        />
      </div>
    </div>
  )
}


const useStyles = makeStyles((theme) => ({
  titleContainer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: '2px',
  },
  leftGroup: {
    'display': 'flex',
    'flexDirection': 'row',
    'justifyContent': 'center',
    'alignItems': 'center',
    '@media (max-width: 900px)': {
      paddingLeft: '12px',
    },
  },
  middleGroup: {
    width: '400px',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightGroup: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  iconContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '14px',
    height: '14px',
  },
  iconContainerClose: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '14px',
    height: '14px',
  },
}))
