import React, {ReactElement} from 'react'
import useStore from '../../store/useStore'
import {ControlButtonWithHashState} from '../Buttons'
import {HASH_PREFIX_APPS} from './hashState'
import WidgetsIcon from '@mui/icons-material/WidgetsOutlined'


/**
 * This button hosts the AppsDialog component and toggles it open and
 * closed.
 *
 * @return {ReactElement}
 */
export default function AppsControl() {
  const isAppsVisible = useStore((state) => state.isAppsVisible)
  const setIsAppsVisible = useStore((state) => state.setIsAppsVisible)
  return (
    <ControlButtonWithHashState
      title='Apps'
      icon={<WidgetsIcon className='icon-apps'/>}
      isDialogDisplayed={isAppsVisible}
      setIsDialogDisplayed={setIsAppsVisible}
      hashPrefix={HASH_PREFIX_APPS}
      placement='bottom'
    >
      <></>
    </ControlButtonWithHashState>
  )
}
