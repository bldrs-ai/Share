import React, {ReactElement} from 'react'
import useStore from '../../store/useStore'
import {ControlButtonWithHashState} from '../Buttons'
import {HASH_PREFIX_PROPERTIES} from './hashState'
import PropertiesIcon from '@mui/icons-material/FormatListBulleted'


/**
 * Toggles the visibility of Properties and sets/removes its URL state token
 *
 * @return {ReactElement}
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
      hashPrefix={HASH_PREFIX_PROPERTIES}
      placement='left'
    />
  )
}
