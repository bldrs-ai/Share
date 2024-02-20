import React, {useEffect} from 'react'
import {useLocation} from 'react-router'
import useStore from '../../store/useStore'
import {getHashParams} from '../../utils/location'
import {ControlButtonWithHashState} from '../Buttons'
import PropertiesIcon from '@mui/icons-material/FormatListBulleted'


/**
 * Toggles the visibility of Properties and sets/removes its URL state token
 *
 * @return {React.ReactElement}
 */
export default function PropertiesControl() {
  const isPropertiesVisible = useStore((state) => state.isPropertiesVisible)
  const setIsPropertiesVisible = useStore((state) => state.setIsPropertiesVisible)

  return (
    <ControlButtonWithHashState
      title='Properties'
      icon={<PropertiesIcon className='icon-share'/>}
      isDialogDisplayed={isPropertiesVisible}
      setIsDialogDisplayed={setIsPropertiesVisible}
      hashPrefix={PROPERTIES_PREFIX}
    />
  )
}


/** The prefix to use for the properties state tokens */
export const PROPERTIES_PREFIX = 'p'
