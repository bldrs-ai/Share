import React, {ReactElement} from 'react'
import {useNavigate} from 'react-router-dom'
import useStore from '../../store/useStore'
import {ControlButtonWithHashState} from '../Buttons'
import OpenModelDialog from './OpenModelDialog'
import {HASH_PREFIX_OPEN_MODEL} from './hashState'
import {FolderOpen as FolderOpenIcon} from '@mui/icons-material'


/**
 * Displays Open Model dialog
 *
 * @return {ReactElement}
 */
export default function OpenModelControl() {
  const isOpenModelVisible = useStore((state) => state.isOpenModelVisible)
  const setIsOpenModelVisible = useStore((state) => state.setIsOpenModelVisible)

  const navigate = useNavigate()

  return (
    <ControlButtonWithHashState
      title='Open Models and Samples'
      icon={<FolderOpenIcon className='icon-share'/>}
      isDialogDisplayed={isOpenModelVisible}
      setIsDialogDisplayed={setIsOpenModelVisible}
      hashPrefix={HASH_PREFIX_OPEN_MODEL}
      dataTestId='control-button-open'
      placement='bottom'
    >
      <OpenModelDialog
        isDialogDisplayed={isOpenModelVisible}
        setIsDialogDisplayed={setIsOpenModelVisible}
        navigate={navigate}
      />
    </ControlButtonWithHashState>
  )
}
