import React from 'react'
import useStore from '../../store/useStore'
import {ControlButtonWithHashState} from '../Buttons'
import HistoryIcon from '@mui/icons-material/History'


/**
 * ControlButton that toggles VersionsPanel, with nav state
 *
 * @return {React.ReactElement}
 */
export default function VersionsControl() {
  const isVersionsVisible = useStore((state) => state.isVersionsVisible)
  const setIsVersionsVisible = useStore((state) => state.setIsVersionsVisible)
  return (
    <ControlButtonWithHashState
      title={'Versions'}
      icon={<HistoryIcon className='icon-share'/>}
      isDialogDisplayed={isVersionsVisible}
      setIsDialogDisplayed={setIsVersionsVisible}
      hashPrefix={VERSIONS_PREFIX}
      placement='bottom'
    />
  )
}


/** The prefix to use for the Versions state tokens */
export const VERSIONS_PREFIX = 'v'
