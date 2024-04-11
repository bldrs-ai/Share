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
        onClose={() => {
          setIsAboutVisible(false)
          setVisited()
        }}
      />
    </ControlButtonWithHashState>
  )
}


const ABOUT_PREFIX = 'about'
