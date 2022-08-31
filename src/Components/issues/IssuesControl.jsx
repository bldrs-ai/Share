import React from 'react'
import {makeStyles, useTheme} from '@mui/styles'
import useStore from '../../store/useStore'
import {addHashParams, removeHashParams} from '../../utils/location'
import {TooltipIconButton} from '../Buttons'
import {setCameraFromParams, addCameraUrlParams, removeCameraUrlParams} from '../CameraControl'
import CloseIcon from '../../assets/2D_Icons/Close.svg'
import BackIcon from '../../assets/2D_Icons/Back.svg'
import NextIcon from '../../assets/2D_Icons/NavNext.svg'
import PreviousIcon from '../../assets/2D_Icons/NavPrev.svg'


/** The prefix to use for issue id in the Url hash. */
export const ISSUE_PREFIX = 'i'


/** @return {Object} React component. */
export function IssuesNavBar() {
  const classes = useStyles(useTheme())
  const issues = useStore((state) => state.issues)
  const selectedIssueId = useStore((state) => state.selectedIssueId)
  const setSelectedIssueId = useStore((state) => state.setSelectedIssueId)
  const selectedIssueIndex = useStore((state) => state.selectedIssueIndex)
  const setSelectedIssueIndex = useStore((state) => state.setSelectedIssueIndex)
  const turnCommentsOff = useStore((state) => state.turnCommentsOff)


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
        {selectedIssueId ? null : 'Notes' }
        {selectedIssueId ?
          <div style={{marginLeft: '-12px'}}>
            <TooltipIconButton
              title='Back to the list'
              placement='bottom'
              size='small'
              onClick={() => {
                removeHashParams(window.location, ISSUE_PREFIX)
                setSelectedIssueId(null)
              }}
              icon={<BackIcon style={{width: '30px', height: '30px'}}/>}
            />
          </div> : null
        }
      </div>

      <div className={classes.middleGroup} >
        {selectedIssueId && issues.length > 1 &&
          <>
            <TooltipIconButton
              title='Previous Note'
              placement='bottom'
              size='small'
              onClick={() => selectIssue('previous')}
              icon={<PreviousIcon style={{width: '20px', height: '20px'}}/>}
            />
            <TooltipIconButton
              title='Next Note'
              size='small'
              placement='bottom'
              onClick={() => selectIssue('next')}
              icon={<NextIcon style={{width: '20px', height: '20px'}}/>}
            />
          </>
        }
      </div>

      <div className={classes.rightGroup}>
        <div className={classes.controls}>
        </div>
        <TooltipIconButton
          title='Close Comments'
          placement='bottom'
          onClick={turnCommentsOff}
          icon={<CloseIcon style={{width: '24px', height: '24px'}}/>}
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
  title: {
    height: '30px',
    display: 'flex',
    fontSize: '18px',
    textDecoration: 'underline',
    fontWeight: 'bold',
    alignItems: 'center',
  },
  contentContainer: {
    marginTop: '10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
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
    'display': 'flex',
    'flexDirection': 'row',
    'justifyContent': 'flex-end',
    'alignItems': 'center',
    'paddingRight': '5px',
    '@media (max-width: 900px)': {
      paddingRight: '0px',
    },
  },
  middleGroup: {
    width: '400px',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  leftGroup: {
    'display': 'flex',
    'flexDirection': 'row',
    'justifyContent': 'center',
    'alignItems': 'center',
    'height': '30px',
    'fontSize': '18px',
    'textDecoration': 'underline',
    'fontWeight': 'bold',
    'paddingLeft': '16px',
    '@media (max-width: 900px)': {
      paddingLeft: '6px',
    },
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
