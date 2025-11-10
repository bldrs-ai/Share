import React, {ReactElement} from 'react'
import useStore from '../../store/useStore'
import {ControlButtonWithHashState} from '../Buttons'
import {HASH_PREFIX_IMAGINE} from './hashState'
import {AutoFixHighOutlined as AutoFixHighOutlinedIcon} from '@mui/icons-material'
import ImagineDialog from './ImagineDialog'


/**
 * This button hosts the ImagineDialog component and toggles it open and
 * closed.
 *
 * @return {ReactElement}
 */
export default function ImagineControl() {
  const isImagineVisible = useStore((state) => state.isImagineVisible)
  const setIsImagineVisible = useStore((state) => state.setIsImagineVisible)
  return (
    <ControlButtonWithHashState
      title='Rendering'
      icon={<AutoFixHighOutlinedIcon className='icon-share'/>}
      isDialogDisplayed={isImagineVisible}
      setIsDialogDisplayed={setIsImagineVisible}
      hashPrefix={HASH_PREFIX_IMAGINE}
      placement='left'
    >
      <ImagineDialog
        isDialogDisplayed={isImagineVisible}
        setIsDialogDisplayed={setIsImagineVisible}
      />
    </ControlButtonWithHashState>
  )
}
