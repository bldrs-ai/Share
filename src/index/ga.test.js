import {captureException} from '@sentry/react'
import {getGaClientId} from '../privacy/analytics'
import setupGa, {GA_MEASUREMENT_ID, shouldInitGa} from './ga'


jest.mock('@sentry/react', () => ({captureException: jest.fn()}))


/** @return {HTMLScriptElement|null} the injected gtag/js tag, if any */
function findGtagScript() {
  return document.head.querySelector(`script[src*="${GA_MEASUREMENT_ID}"]`)
}


beforeEach(() => {
  jest.clearAllMocks()
  document.head.querySelectorAll('script').forEach((s) => s.remove())
  // Mirror the inline bootstrap index.html declares before the bundle.
  window.dataLayer = []
  window.gtag = function gtag() {
    window.dataLayer.push(arguments)
  }
})


describe('shouldInitGa', () => {
  test('true only on prod hosts', () => {
    expect(shouldInitGa({hostname: 'bldrs.ai', isWebdriver: false})).toBe(true)
    expect(shouldInitGa({hostname: 'www.bldrs.ai', isWebdriver: false})).toBe(true)
    expect(shouldInitGa({hostname: 'localhost', isWebdriver: false})).toBe(false)
    expect(shouldInitGa({hostname: 'bldrs-share-dev.netlify.app', isWebdriver: false})).toBe(false)
    expect(shouldInitGa({hostname: 'deploy-preview-1741--bldrs-share-prod.netlify.app', isWebdriver: false})).toBe(false)
    expect(shouldInitGa({hostname: 'bldrs-ai.github.io', isWebdriver: false})).toBe(false)
  })

  test('false under automation even on prod', () => {
    expect(shouldInitGa({hostname: 'bldrs.ai', isWebdriver: true})).toBe(false)
  })
})


describe('setupGa', () => {
  test('does not inject the loader off-prod', () => {
    setupGa({hostname: 'localhost', isWebdriver: false})
    expect(findGtagScript()).toBeNull()
    expect(captureException).not.toHaveBeenCalled()
  })

  test('injects the async gtag/js loader on prod', () => {
    setupGa({hostname: 'bldrs.ai', isWebdriver: false})
    const script = findGtagScript()
    expect(script).not.toBeNull()
    expect(script.async).toBe(true)
    expect(script.src).toBe(`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`)
    expect(captureException).not.toHaveBeenCalled()
  })

  test('reports a load failure to Sentry, tagged ga_init', () => {
    setupGa({hostname: 'bldrs.ai', isWebdriver: false})
    findGtagScript().onerror()
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({message: expect.stringContaining('ga_init: gtag/js failed to load')}),
      {tags: {subsystem: 'ga_init'}},
    )
  })

  // GA4 has no user-id dimension, so the client id ships as an event
  // param; the callback only resolves once gtag/js actually loads.
  test('requests the GA client id and records it for model-open events', () => {
    setupGa({hostname: 'bldrs.ai', isWebdriver: false})
    const getCall = window.dataLayer.find((entry) => entry?.[0] === 'get')
    expect(getCall).toBeDefined()
    expect(getCall[1]).toBe(GA_MEASUREMENT_ID)
    expect(getCall[2]).toBe('client_id')
    expect(getGaClientId()).toBeNull()
    getCall[3]('1234567890.0987654321')
    expect(getGaClientId()).toBe('1234567890.0987654321')
  })

  test('does not request a client id off-prod', () => {
    setupGa({hostname: 'localhost', isWebdriver: false})
    expect(window.dataLayer.find((entry) => entry?.[0] === 'get')).toBeUndefined()
  })

  test('reports a missing inline bootstrap to Sentry without throwing', () => {
    delete window.gtag
    expect(() => setupGa({hostname: 'bldrs.ai', isWebdriver: false})).not.toThrow()
    expect(findGtagScript()).toBeNull()
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({message: expect.stringContaining('ga_init: gtag bootstrap missing')}),
      {tags: {subsystem: 'ga_init'}},
    )
  })
})
