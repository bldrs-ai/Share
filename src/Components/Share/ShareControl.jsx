import React, {ReactElement} from 'react'
import useStore from '../../store/useStore'
import {ControlButtonWithHashState} from '../Buttons'
import {HASH_PREFIX_SHARE} from './hashState'
import {ShareOutlined as ShareIcon} from '@mui/icons-material'
import ShareDialog from './ShareDialog'


/**
 * This button hosts the ShareDialog component and toggles it open and
 * closed.
 *
 * @return {ReactElement} The button react component, with a hosted
 *   ShareDialog component
 */
export default function ShareControl() {
  const isShareVisible = useStore((state) => state.isShareVisible)
  const setIsShareVisible = useStore((state) => state.setIsShareVisible)
  return (
    <ControlButtonWithHashState
      title='Share'
      icon={<ShareIcon className='icon-share'/>}
      isDialogDisplayed={isShareVisible}
      setIsDialogDisplayed={setIsShareVisible}
      hashPrefix={HASH_PREFIX_SHARE}
      placement='bottom'
    >
      <ShareDialog
        isDialogDisplayed={isShareVisible}
        setIsDialogDisplayed={setIsShareVisible}
      />
    </ControlButtonWithHashState>
  )
}
