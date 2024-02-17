import React from 'react'
import AboutControl from '../Components/About/AboutControl'
import HelpControl from '../Components/HelpControl'
import LoadingBackdrop from '../Components/LoadingBackdrop'
import LoginMenu from '../Components/LoginMenu'
import useStore from '../store/useStore'
import debug from '../utils/debug'
import AlertDialogAndSnackbar from './AlertDialogAndSnackbar'
import ModelGroup from './ModelGroup'
import ViewRoot from './ViewRoot'


let count = 0

/** @return {React.ReactElement} */
export default function CadView() {
  debug(5).log('CadView: loadCount:', count++)
  const isLoginEnabled = useStore((state) => state.isLoginEnabled)
  return (
    <ViewRoot>
      <ModelGroup/>
      {isLoginEnabled && <LoginMenu/>}
      <AboutControl/>
      <HelpControl/>
      <AlertDialogAndSnackbar/>
      <LoadingBackdrop/>
    </ViewRoot>
  )
}
