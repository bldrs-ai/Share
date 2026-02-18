import React, {ReactElement, useEffect, useState} from 'react'
import {isFirst, setVisited} from '../../privacy/firstTime'
import useStore from '../../store/useStore'
import {TooltipIconButton} from '../Buttons'
import {LogoB} from '../Logo/Logo'
import AboutDialog from './AboutDialog'
import OnboardingOverlay from '../Onboarding/OnboardingOverlay'
import PkgJson from '../../../package.json'


/**
 * Button to toggle About panel on and off.
 *
 * - First-time visitors: shows the AboutDialog splash screen
 * - Returning visitors: navigates to the /about marketing page
 *
 * @return {ReactElement}
 */
export default function AboutControl() {
  const isAboutVisible = useStore((state) => state.isAboutVisible)
  const setIsAboutVisible = useStore((state) => state.setIsAboutVisible)
  const setIsNotesVisible = useStore((state) => state.setIsNotesVisible)
  const isOnboardingOverlayVisible = useStore((state) => state.isOnboardingOverlayVisible)
  const onboardingOverlaySource = useStore((state) => state.onboardingOverlaySource)
  const setIsOnboardingOverlayVisible = useStore((state) => state.setIsOnboardingOverlayVisible)

  // Track if we should show onboarding when About dialog closes
  const [shouldShowOnboardingAfterAbout, setShouldShowOnboardingAfterAbout] = useState(false)

  // When About dialog becomes visible for first-time users, mark that we should show onboarding after
  useEffect(() => {
    if (isAboutVisible && isFirst()) {
      setShouldShowOnboardingAfterAbout(true)
    }
  }, [isAboutVisible])

  // Show onboarding overlay after AboutDialog is closed for first-time users
  useEffect(() => {
    if (!isAboutVisible && shouldShowOnboardingAfterAbout) {
      // Small delay to ensure AboutDialog is fully closed
      const overlayDelay = 300
      const timer = setTimeout(() => {
        setIsOnboardingOverlayVisible(true, 'about')
        setShouldShowOnboardingAfterAbout(false) // Reset the flag
      }, overlayDelay)
      return () => clearTimeout(timer)
    }
  }, [isAboutVisible, shouldShowOnboardingAfterAbout, setIsOnboardingOverlayVisible])

  // Ensure that the dialog can be closed by updating the state appropriately
  const handleDialogClose = () => {
    if (isFirst()) {
      setVisited() // Mark as visited to prevent the dialog from being forced open again
      // Improve first-time experience by showing Notes
      // https://github.com/bldrs-ai/Share/issues/1320
      setIsNotesVisible(true)
    }
    setIsAboutVisible(false) // Always close the dialog when onClose is triggered
  }

  // Handle onboarding overlay close from About flow
  const handleOnboardingClose = () => {
    setIsOnboardingOverlayVisible(false)
  }

  // Logo click: first-time visitors see splash dialog, returning users go to marketing page
  // Opens in a new tab to preserve the user's model state and viewer context
  const handleLogoClick = () => {
    if (isFirst()) {
      setIsAboutVisible(true)
    } else {
      window.open('/about', '_blank')
    }
  }

  return (
    <>
      <TooltipIconButton
        title={`About Bldrs\n${PkgJson.version}`}
        icon={<LogoB/>}
        onClick={handleLogoClick}
        placement='right'
        selected={isAboutVisible}
        variant='control'
        color='success'
        size='small'
        dataTestId={testId}
      />
      <AboutDialog
        isDialogDisplayed={isAboutVisible}
        setIsDialogDisplayed={setIsAboutVisible}
        onClose={handleDialogClose}
      />
      {onboardingOverlaySource === 'about' && (
        <OnboardingOverlay
          isVisible={isOnboardingOverlayVisible}
          onClose={handleOnboardingClose}
        />
      )}
    </>
  )
}


export const testId = 'control-button-about'
