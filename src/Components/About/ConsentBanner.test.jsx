import Cookies from 'js-cookie'
import React from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import {CONSENT_COOKIE_NAME, CONSENT_LEVELS, getConsentLevel, setConsentLevel} from '../../privacy/consent'
import {LOCAL_ONLY_MODE_NAME} from '../../privacy/localOnlyMode'
import useStore from '../../store/useStore'
import AboutControl, {testId as aboutTestId} from './AboutControl'
import ConsentBanner, {
  BANNER_Z,
  CONSENT_HEADLINE,
  CONSENT_SHORT_TEXT,
  CONSENT_TEXT,
  ONBOARDING_OVERLAY_Z,
  PRIVACY_POLICY_HREF,
} from './ConsentBanner'


/** @return {Array} analytics_storage values of every consent update queued */
function analyticsUpdates() {
  return window.dataLayer
    .filter((entry) => entry[0] === 'consent' && entry[1] === 'update')
    .map((entry) => entry[2].analytics_storage)
}


/**
 * @param {object} state store state to start from
 */
function renderBanner(state = {}) {
  act(() => {
    useStore.setState({
      isConsentBannerVisible: true,
      isAboutVisible: false,
      isOnboardingOverlayVisible: false,
      alert: null,
      privacyLevel: getConsentLevel(),
      ...state,
    })
  })
  render(<ConsentBanner/>, {wrapper: HelmetStoreRouteThemeCtx})
}


/**
 * design/new/analytics-consent.md §"The banner": the choice is asked at the
 * foot of the page, never in a dialog, and only Accept or Decline answers it.
 */
describe('ConsentBanner', () => {
  beforeEach(() => {
    // tools/jest/setupTests.js starts every test consented; these start
    // from a visitor who hasn't chosen.
    Cookies.remove(CONSENT_COOKIE_NAME)
    window.dataLayer = []
    window.gtag = function gtag() {
      window.dataLayer.push(arguments)
    }
  })

  // Layered: the essentials in two lines, everything behind Details.
  test('leads with what stays local, names GA, its cookies and what decline costs, and stores nothing', () => {
    renderBanner()
    const summary = screen.getByTestId('consent-summary')
    expect(summary).toHaveTextContent(CONSENT_HEADLINE)
    expect(summary).toHaveTextContent(CONSENT_SHORT_TEXT)
    expect(CONSENT_SHORT_TEXT).toContain('Google Analytics cookies')
    expect(CONSENT_SHORT_TEXT).toContain('No ads.')
    // What Decline costs, concretely, before either button (codex on #2354).
    expect(CONSENT_SHORT_TEXT).toContain('Declining limits Bldrs to local files and samples')
    expect(CONSENT_SHORT_TEXT).toContain('no GitHub, Drive or link models, saving or sharing')
    // Not a modal, and nothing to close it with but an answer.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByTestId(/^button-close/)).toBeNull()
    expect(getConsentLevel()).toBeNull()
  })

  test('Details shows everything the policy says, with its link', () => {
    renderBanner()
    expect(screen.queryByTestId('consent-privacy-link')).toBeNull()
    fireEvent.click(screen.getByTestId('consent-details'))
    const summary = screen.getByTestId('consent-summary')
    expect(summary).toHaveTextContent(CONSENT_TEXT)
    // Everything Accept turns on, and what Decline leaves on, as the policy
    // says (src/pages/Privacy.jsx §1).
    expect(CONSENT_TEXT).toContain('never uploaded to our servers')
    expect(CONSENT_TEXT).toContain('Google Analytics, which sets cookies holding a pseudonymous ID')
    expect(CONSENT_TEXT).toContain('visits and feature use')
    expect(CONSENT_TEXT).toContain('(format, size, source)')
    expect(CONSENT_TEXT).toContain('No advertising.')
    expect(CONSENT_TEXT).toContain(`If you decline, Bldrs runs in ${LOCAL_ONLY_MODE_NAME}`)
    expect(CONSENT_TEXT).toContain('Error reports stay on either way.')
    expect(screen.getByTestId('consent-privacy-link')).toBeInTheDocument()
  })

  // Equal weight: an outlined Decline read as disabled beside a filled Accept.
  test('Decline and Accept look the same', () => {
    renderBanner()
    expect(screen.getByTestId('consent-decline').className).toBe(screen.getByTestId('consent-accept').className)
  })

  test('Accept allows analytics, grants GA consent and goes away', async () => {
    renderBanner()
    fireEvent.click(screen.getByTestId('consent-accept'))
    await waitFor(() => expect(getConsentLevel()).toBe(CONSENT_LEVELS.FUNCTIONAL))
    expect(analyticsUpdates()).toEqual(['granted'])
    expect(useStore.getState().privacyLevel).toBe(CONSENT_LEVELS.FUNCTIONAL)
    expect(screen.queryByTestId('consent-banner')).toBeNull()
  })

  test('Decline stores restricted, grants nothing and goes away', async () => {
    renderBanner()
    fireEvent.click(screen.getByTestId('consent-decline'))
    await waitFor(() => expect(getConsentLevel()).toBe(CONSENT_LEVELS.RESTRICTED))
    expect(analyticsUpdates()).not.toContain('granted')
    expect(useStore.getState().privacyLevel).toBe(CONSENT_LEVELS.RESTRICTED)
    expect(screen.queryByTestId('consent-banner')).toBeNull()
  })

  test('a visitor who accepted can take it back, and is told what they chose', async () => {
    setConsentLevel(CONSENT_LEVELS.FUNCTIONAL)
    renderBanner()
    expect(screen.getByTestId('consent-summary')).toHaveTextContent('You accepted.')
    fireEvent.click(screen.getByTestId('consent-decline'))
    await waitFor(() => expect(getConsentLevel()).toBe(CONSENT_LEVELS.RESTRICTED))
    expect(analyticsUpdates()).toEqual(['denied'])
  })

  test('steps aside while About is open', () => {
    renderBanner({isAboutVisible: true})
    expect(screen.queryByTestId('consent-banner')).toBeNull()
  })

  // A first-timer's About closes straight into the tour, Privacy settings
  // included; waiting behind the tour made that link look like a no-op.
  test('shows over the onboarding tour, and drops back under dialogs after it', () => {
    renderBanner({isOnboardingOverlayVisible: true})
    const banner = screen.getByTestId('consent-banner')
    const zOf = () => Number(getComputedStyle(screen.getByTestId('consent-banner').parentElement).zIndex)
    expect(banner).toBeInTheDocument()
    expect(zOf()).toBeGreaterThan(ONBOARDING_OVERLAY_Z)
    act(() => {
      useStore.setState({isOnboardingOverlayVisible: false})
    })
    expect(zOf()).toBe(BANNER_Z)
  })

  // A failed load can raise an alert while the tour is still up.
  test('stays under an alert dialog even while the tour is up', () => {
    renderBanner({isOnboardingOverlayVisible: true, alert: {title: 'Load failed'}})
    expect(Number(getComputedStyle(screen.getByTestId('consent-banner').parentElement).zIndex)).toBe(BANNER_Z)
    act(() => {
      useStore.setState({alert: null})
    })
  })

  test('links to the privacy policy page, in a new tab', () => {
    renderBanner()
    fireEvent.click(screen.getByTestId('consent-details'))
    const link = screen.getByTestId('consent-privacy-link')
    expect(PRIVACY_POLICY_HREF).toBe('/privacy/')
    expect(link).toHaveAttribute('href', '/privacy/')
    expect(link).toHaveAttribute('target', '_blank')
  })
})


describe('About no longer asks', () => {
  beforeEach(() => {
    Cookies.remove(CONSENT_COOKIE_NAME)
  })

  /** Open About from its control, as a visitor would. */
  function openAbout() {
    act(() => {
      useStore.setState({isAboutVisible: false, isConsentBannerVisible: false})
    })
    render(<AboutControl/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByTestId(aboutTestId))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  }

  // #2051 stored any close but OK as a decline, which refused an undecided
  // visitor's GitHub and Drive links after they closed About to get to them.
  const closeBy = {
    'OK button': () => fireEvent.click(screen.getByTestId('button-dialog-main-action')),
    'X button': () => fireEvent.click(screen.getByTestId(/^button-close-dialog-/)),
    'Escape key': () => fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape'}),
    'logo button': () => fireEvent.click(screen.getByTestId(aboutTestId)),
  }
  Object.entries(closeBy).forEach(([how, close]) => {
    test(`closing it via ${how} leaves the choice unmade`, async () => {
      openAbout()
      close()
      await waitFor(() => expect(useStore.getState().isAboutVisible).toBe(false))
      expect(getConsentLevel()).toBeNull()
      expect(screen.queryByTestId('button-dialog-cancel')).toBeNull()
    })
  })

  test('Privacy settings closes About and brings the banner up', async () => {
    openAbout()
    fireEvent.click(screen.getByTestId('about-privacy-settings'))
    await waitFor(() => expect(useStore.getState().isAboutVisible).toBe(false))
    expect(useStore.getState().isConsentBannerVisible).toBe(true)
  })
})
