import Cookies from 'js-cookie'
import React from 'react'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import {CONSENT_COOKIE_NAME, CONSENT_LEVELS, getConsentLevel, setConsentLevel} from '../../privacy/consent'
import useStore from '../../store/useStore'
import AboutControl, {testId} from './AboutControl'
import {CONSENT_COPY} from './ConsentControl'


/** Open About from its control, as a visitor would. */
function openAbout() {
  // The store is a singleton whose isAboutVisible starts true for an
  // undecided visitor (hashState.js), so the click would close it.
  useStore.setState({isAboutVisible: false})
  render(<AboutControl/>, {wrapper: HelmetStoreRouteThemeCtx})
  fireEvent.click(screen.getByTestId(testId))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
}


/** @return {HTMLInputElement} the privacy slider's range input */
function slider() {
  return screen.getByRole('slider', {name: 'Privacy level'})
}


/**
 * @param {number} position 0 Browse only, 1 Functional, 2 Public sharing
 */
function moveSliderTo(position) {
  fireEvent.change(slider(), {target: {value: position}})
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

  afterEach(() => {
    delete navigator.globalPrivacyControl
  })

  test('starts at Functional, with nothing stored until OK', () => {
    openAbout()
    expect(slider()).toHaveAttribute('aria-valuetext', 'Functional')
    expect(screen.getByTestId('consent-summary'))
      .toHaveTextContent(CONSENT_COPY[CONSENT_LEVELS.FUNCTIONAL].summary)
    expect(getConsentLevel()).toBeNull()
  })

  test('OK stores Functional and grants GA consent', async () => {
    openAbout()
    fireEvent.click(screen.getByTestId('button-dialog-main-action'))
    await waitFor(() => expect(getConsentLevel()).toBe(CONSENT_LEVELS.FUNCTIONAL))
    const update = window.dataLayer.find((entry) => entry[0] === 'consent' && entry[1] === 'update')
    expect(update[2].analytics_storage).toBe('granted')
  })

  test('OK stores the level the slider was moved to', async () => {
    openAbout()
    moveSliderTo(2)
    expect(screen.getByTestId('consent-summary'))
      .toHaveTextContent(CONSENT_COPY[CONSENT_LEVELS.PUBLIC].summary)
    fireEvent.click(screen.getByTestId('button-dialog-main-action'))
    await waitFor(() => expect(getConsentLevel()).toBe(CONSENT_LEVELS.PUBLIC))
  })

  // Any close but OK is a decline for a visitor who hasn't chosen.
  const closeBy = {
    'Cancel button': () => fireEvent.click(screen.getByTestId('button-dialog-cancel')),
    'X button': () => fireEvent.click(screen.getByTestId(/^button-close-dialog-/)),
    'Escape key': () => fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape'}),
    'logo button': () => fireEvent.click(screen.getByTestId(testId)),
  }
  Object.entries(closeBy).forEach(([how, close]) => {
    test(`closing via ${how} stores Browse only and grants nothing`, async () => {
      openAbout()
      close()
      await waitFor(() => expect(getConsentLevel()).toBe(CONSENT_LEVELS.RESTRICTED))
      const grants = window.dataLayer.filter((entry) =>
        entry[0] === 'consent' && entry[2]?.analytics_storage === 'granted')
      expect(grants).toHaveLength(0)
    })
  })

  test('a visitor who already chose keeps their choice on Cancel', async () => {
    setConsentLevel(CONSENT_LEVELS.PUBLIC)
    openAbout()
    expect(slider()).toHaveAttribute('aria-valuetext', 'Public sharing')
    moveSliderTo(0)
    fireEvent.click(screen.getByTestId('button-dialog-cancel'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(getConsentLevel()).toBe(CONSENT_LEVELS.PUBLIC)
  })

  test('a returning visitor can lower their level later', async () => {
    setConsentLevel(CONSENT_LEVELS.FUNCTIONAL)
    openAbout()
    moveSliderTo(0)
    fireEvent.click(screen.getByTestId('button-dialog-main-action'))
    await waitFor(() => expect(getConsentLevel()).toBe(CONSENT_LEVELS.RESTRICTED))
    expect(window.dataLayer).toContainEqual(expect.objectContaining({
      0: 'consent', 1: 'update', 2: expect.objectContaining({analytics_storage: 'denied'}),
    }))
  })

  test('starts at Browse only when the browser sends Global Privacy Control', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {value: true, configurable: true})
    openAbout()
    expect(slider()).toHaveAttribute('aria-valuetext', 'Browse only')
  })
})
