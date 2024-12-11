import React, {ReactElement} from 'react'
import useStore from '../../store/useStore'
import {ControlButtonWithHashState} from '../Buttons'
import {VERSIONS_TITLE} from './component'
import {HASH_PREFIX_VERSIONS} from './hashState'
import HistoryIcon from '@mui/icons-material/History'


/**
 * ControlButton that toggles VersionsPanel, with nav state
 *
 * @return {ReactElement}
 */
export default function VersionsControl() {
  const isVersionsVisible = useStore((state) => state.isVersionsVisible)
  const setIsVersionsVisible = useStore((state) => state.setIsVersionsVisible)
  return (
    <ControlButtonWithHashState
      title={VERSIONS_TITLE}
      icon={<HistoryIcon className='icon-share'/>}
      isDialogDisplayed={isVersionsVisible}
      setIsDialogDisplayed={setIsVersionsVisible}
      hashPrefix={HASH_PREFIX_VERSIONS}
      placement='right'
    />
  )
}
