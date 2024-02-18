import React, {useEffect} from 'react'
import Box from '@mui/material/Box'
import AboutControl from '../Components/About/AboutControl'
import HelpControl from '../Components/HelpControl'
import LoadingBackdrop from '../Components/LoadingBackdrop'
import LoginMenu from '../Components/LoginMenu'
import {doCreateRoot} from '../scene/Scene'
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


  useEffect(() => {
    doCreateRoot()
  }, [])


  return (
    <ViewRoot>
      <ModelGroup/>
      <Box sx={{position: 'fixed', top: '1em', right: '1em', width: '3em', height: '3em'}}>
        {isLoginEnabled && <LoginMenu/>}
      </Box>
      <AboutControl/>
      <HelpControl/>
      <AlertDialogAndSnackbar/>
      <LoadingBackdrop/>
    </ViewRoot>
  )
}
