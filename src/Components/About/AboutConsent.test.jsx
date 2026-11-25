import Cookies from 'js-cookie'
import React from 'react'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import {CONSENT_COOKIE_NAME, CONSENT_LEVELS, getConsentLevel, setConsentLevel} from '../../privacy/consent'
import {LOCAL_ONLY_MODE_NAME} from '../../app/localOnlyMode'
import useStore from '../../store/useStore'
import AboutControl, {testId} from './AboutControl'
import {CONSENT_TEXT, PRIVACY_POLICY_HREF} from './ConsentNotice'


/** Open About from its control, as a visitor would. */
function openAbout() {
  // The store is a singleton whose isAboutVisible starts true for an
  // undecided visitor (hashState.js), so the click would close it.
  useStore.setState({isAboutVisible: false})
  render(<AboutControl/>, {wrapper: HelmetStoreRouteThemeCtx})
  fireEvent.click(screen.getByTestId(testId))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
}


/** @return {Array} analytics_storage values of every consent update queued */
function analyticsUpdates() {
  return window.dataLayer
    .filter((entry) => entry[0] === 'consent' && entry[1] === 'update')
    .map((entry) => entry[2].analytics_storage)
}


describe('About dialog privacy choice', () => {
  beforeEach(() => {
    // tools/jest/setupTests.js starts every test consented; these start
    // from a visitor who hasn't chosen.
    Cookies.remove(CONSENT_COOKIE_NAME)
    window.dataLayer = []
    window.gtag = function gtag() {
      window.dataLayer.push(arguments)
    }
  })

  test('asks in the owner\'s words, naming the mode Cancel gives, with nothing stored yet', () => {
    openAbout()
    expect(screen.getByTestId('consent-summary')).toHaveTextContent(CONSENT_TEXT)
    expect(CONSENT_TEXT).toContain('pseudonymous ID')
    expect(CONSENT_TEXT).toContain(`Press Cancel for ${LOCAL_ONLY_MODE_NAME}.`)
    expect(screen.queryByRole('slider')).toBeNull()
    expect(getConsentLevel()).toBeNull()
  })

  test('OK allows analytics and grants GA consent', async () => {
    openAbout()
    fireEvent.click(screen.getByTestId('button-dialog-main-action'))
    await waitFor(() => expect(getConsentLevel()).toBe(CONSENT_LEVELS.FUNCTIONAL))
    expect(analyticsUpdates()).toEqual(['granted'])
  })

  // Any close but OK is a decline for a visitor who hasn't chosen.
  const closeBy = {
    'Cancel button': () => fireEvent.click(screen.getByTestId('button-dialog-cancel')),
    'X button': () => fireEvent.click(screen.getByTestId(/^button-close-dialog-/)),
    'Escape key': () => fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape'}),
    'logo button': () => fireEvent.click(screen.getByTestId(testId)),
  }
  Object.entries(closeBy).forEach(([how, close]) => {
    test(`closing via ${how} declines and grants nothing`, async () => {
      openAbout()
      close()
      await waitFor(() => expect(getConsentLevel()).toBe(CONSENT_LEVELS.RESTRICTED))
      expect(analyticsUpdates()).not.toContain('granted')
    })
  })

  // Cancel is an answer, so it can take consent back; closing About is not,
  // so it leaves a choice alone.
  test('a visitor who allowed analytics can take it back with Cancel', async () => {
    setConsentLevel(CONSENT_LEVELS.FUNCTIONAL)
    openAbout()
    fireEvent.click(screen.getByTestId('button-dialog-cancel'))
    await waitFor(() => expect(getConsentLevel()).toBe(CONSENT_LEVELS.RESTRICTED))
    expect(analyticsUpdates()).toEqual(['denied'])
  })

  test('a visitor who allowed analytics keeps it when closing About with X', async () => {
    setConsentLevel(CONSENT_LEVELS.FUNCTIONAL)
    openAbout()
    fireEvent.click(screen.getByTestId(/^button-close-dialog-/))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(getConsentLevel()).toBe(CONSENT_LEVELS.FUNCTIONAL)
    expect(analyticsUpdates()).toEqual([])
  })

  test('a visitor who declined can allow analytics later with OK', async () => {
    setConsentLevel(CONSENT_LEVELS.RESTRICTED)
    openAbout()
    fireEvent.click(screen.getByTestId('button-dialog-main-action'))
    await waitFor(() => expect(getConsentLevel()).toBe(CONSENT_LEVELS.FUNCTIONAL))
    expect(useStore.getState().privacyLevel).toBe(CONSENT_LEVELS.FUNCTIONAL)
  })

  // It pointed at /share/privacy, which no route serves, so it opened a
  // blank page.
  test('links to the privacy policy page, in a new tab', () => {
    openAbout()
    const link = screen.getByTestId('consent-privacy-link')
    expect(PRIVACY_POLICY_HREF).toBe('/privacy/')
    expect(link).toHaveAttribute('href', '/privacy/')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
