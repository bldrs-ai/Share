import React from 'react'
import ButtonGroup from '@mui/material/ButtonGroup'
import OpenModelControl from './OpenModelControl'
import useStore from '../store/useStore'
import {TooltipIconButton} from './Buttons'
import HistoryIcon from '@mui/icons-material/History'
import TreeIcon from '../assets/icons/Tree.svg'


/**
 * OperationsGroup contains tools for sharing, notes, properties, cut
 * plane, deselect, theme change and about.
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.Component}
 */
export default function ControlsGroup({fileOpen, repo}) {
  const isSettingsVisible = useStore((state) => state.isSettingsVisible)
  const isVersionHistoryVisible = useStore((state) => state.isVersionHistoryVisible)
  const toggleIsVersionHistoryVisible = useStore((state) => state.toggleIsVersionHistoryVisible)
  const isNavigationVisible = useStore((state) => state.isNavigationVisible)
  const toggleIsNavigationVisible = useStore((state) => state.toggleIsNavigationVisible)
  return (
    <ButtonGroup
      orientation='vertical'
      variant='contained'
      sx={{borderRadius: '4px'}}
      spacing="0.5rem"
    >
      <OpenModelControl fileOpen={fileOpen}/>
      {isSettingsVisible &&
          <>
            <TooltipIconButton
              title='Navigation'
              icon={<TreeIcon className='icon-share' color='secondary' style={{width: '17px', height: '17px'}}/>}
              placement='right'
              dataTestId='Navigation'
              aboutInfo={false}
              selected={isNavigationVisible}
              onClick={() => {
                if (isVersionHistoryVisible) {
                  toggleIsVersionHistoryVisible()
                  toggleIsNavigationVisible()
                } else {
                  toggleIsNavigationVisible()
                }
              }}
            />
            {repo !== undefined &&
              <TooltipIconButton
                title='Versions'
                icon={<HistoryIcon className='icon-share' color='secondary'/>}
                placement='right'
                selected={isVersionHistoryVisible}
                onClick={() => {
                  if (isNavigationVisible) {
                    toggleIsVersionHistoryVisible()
                    toggleIsNavigationVisible()
                  } else {
                    toggleIsVersionHistoryVisible()
                  }
                }}
              />
            }
          </>
      }
    </ButtonGroup>
  )
}
