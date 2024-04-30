import React, {ReactElement} from 'react'
import {isFirst, setVisited} from '../../privacy/firstTime'
import useStore from '../../store/useStore'
import {ControlButtonWithHashState} from '../Buttons'
import {LogoB} from '../Logo/Logo'
import AboutDialog from './AboutDialog'
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
      icon={<LogoB/>}
      isDialogDisplayed={isFirst() || isAboutVisible}
      setIsDialogDisplayed={setIsAboutVisible}
      hashPrefix={ABOUT_PREFIX}
      placement='right'
      buttonTestId='control-button-about'
    >
      <AboutDialog
        isDialogDisplayed={isFirst() || isAboutVisible}
        setIsDialogDisplayed={setIsAboutVisible}
        onClose={handleDialogClose}
      />
    </ControlButtonWithHashState>
  )
}

const ABOUT_PREFIX = 'about'
