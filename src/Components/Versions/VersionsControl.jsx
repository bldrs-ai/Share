import React, {useEffect} from 'react'
import {useLocation} from 'react-router'
import useStore from '../../store/useStore'
import {addHashParams, getHashParams, removeHashParams} from '../../utils/location'
import {TooltipIconButton} from '../Buttons'
import HistoryIcon from '@mui/icons-material/History'


/**
 * The TooltipIconButton in the ControlsGroup to control display of Versions
 *
 * @return {React.ReactElement}
 */
export default function VersionsControl() {
  const isVersionsVisible = useStore((state) => state.isVersionsVisible)
  const setIsVersionsVisible = useStore((state) => state.setIsVersionsVisible)

  const location = useLocation()

  useEffect(() => {
    setIsVersionsVisible(getHashParams(location, VERSIONS_PREFIX) !== undefined)
  }, [location, setIsVersionsVisible])

  /** Toggle Versions visibility and set its state token */
  function onVersionsClick() {
    if (isVersionsVisible) {
      removeHashParams(window.location, VERSIONS_PREFIX)
    } else {
      addHashParams(window.location, VERSIONS_PREFIX)
    }
  }

  return (
    <TooltipIconButton
      title='Versions'
      icon={<HistoryIcon className='icon-share'/>}
      onClick={onVersionsClick}
    />
  )
}


/** The prefix to use for the Versions state tokens */
export const VERSIONS_PREFIX = 'v'
