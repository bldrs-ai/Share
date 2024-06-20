import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import {isFirst, setVisited} from '../../privacy/firstTime'
import useStore from '../../store/useStore'
import {ControlButtonWithHashState} from '../Buttons'
import {LogoB} from '../Logo/Logo'
import AboutDialog from './AboutDialog'
import {HASH_PREFIX_ABOUT} from './hashState'
import PkgJson from '../../../package.json'


/**
 * Button to toggle About panel on and off.  Default state is open until
 * firstTime cookie is set, then closed.
 *
 * @return {ReactElement}
 */
export default function AboutControl() {
  const isAboutVisible = useStore((state) => state.isAboutVisible)
  const setIsAboutVisible = useStore((state) => state.setIsAboutVisible)

  // Ensure that the dialog can be closed by updating the state appropriately
  const handleDialogClose = () => {
    if (isFirst()) {
      setVisited() // Mark as visited to prevent the dialog from being forced open again
    }
    setIsAboutVisible(false) // Always close the dialog when onClose is triggered
  }

  return (
    <ControlButtonWithHashState
      title={`Bldrs: ${PkgJson.version}`}
      icon={<Box sx={{marginTop: '.5em'}}><LogoB/></Box>}
      isDialogDisplayed={isAboutVisible}
      setIsDialogDisplayed={setIsAboutVisible}
      hashPrefix={HASH_PREFIX_ABOUT}
      placement='right'
      buttonTestId='control-button-about'
    >
      <AboutDialog
        isDialogDisplayed={isAboutVisible}
        setIsDialogDisplayed={setIsAboutVisible}
        onClose={handleDialogClose}
      />
    </ControlButtonWithHashState>
  )
}
