import {captureException} from '@sentry/react'
import {setGaClientId, setUserCidProperty} from '../privacy/analytics'


// Must match the ID in public/index.html's inline gtag('config') stub —
// the stub routes buffered events to the property, this constant only
// fetches the loader. A property migration has to update both.
export const GA_MEASUREMENT_ID = 'G-GRLNVMZRGW'

// Apex is canonical; www is included in case a client renders before
// any redirect settles. Everything else — localhost, *.netlify.app
// previews/dev, GitHub Pages installs — must not feed prod analytics.
const PROD_HOSTNAMES = ['bldrs.ai', 'www.bldrs.ai']


/**
 * True when this page should load Google Analytics: production host
 * only, and never under automation (Playwright/Selenium/Puppeteer set
 * navigator.webdriver). Off-prod and automated traffic polluted the
 * metrics Google Ads bids on — see design/roadmap.md grow-120 and the
 * matching event-level guard in privacy/analytics#isRealModelOpen.
 *
 * @param {object} [env] overrides for tests
 * @param {string} [env.hostname]
 * @param {boolean} [env.isWebdriver]
 * @return {boolean}
 */
export function shouldInitGa({
  hostname = window.location.hostname,
  isWebdriver = navigator.webdriver === true,
} = {}) {
  return PROD_HOSTNAMES.includes(hostname) && !isWebdriver
}


/**
 * Inject the gtag/js loader when shouldInitGa allows. index.html keeps
 * the inline dataLayer/gtag stub unconditionally (gtagEvent calls
 * buffer there, and the E2E suite asserts against that buffer on
 * localhost), so off-prod the app behaves identically minus the
 * network beacon.
 *
 * Any init failure is reported to Sentry tagged subsystem:ga_init so
 * we can see when prod loses its Ads-conversion signal. The expected
 * steady-state noise here is ad-blocker users failing the script load;
 * keep the tag stable so a future sentry.js filter (or a GA-side
 * blocked-client event, cf. netlify_rum_blocked) can key off it.
 *
 * @param {object} [env] overrides for tests, forwarded to shouldInitGa
 */
export default function setupGa(env = undefined) {
  if (!shouldInitGa(env)) {
    return
  }
  try {
    // The stub is declared inline in index.html before the bundle
    // loads; its absence means the bootstrap contract broke.
    if (typeof window.gtag !== 'function' || !Array.isArray(window.dataLayer)) {
      throw new Error('ga_init: gtag bootstrap missing — index.html inline stub did not run')
    }
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
    script.onerror = () => {
      captureException(
        new Error('ga_init: gtag/js failed to load (blocked client or network failure)'),
        {tags: {subsystem: 'ga_init'}},
      )
    }
    document.head.appendChild(script)
    // Second of three places the user property is published, each for a
    // distinct reason. index.html's inline stub sets it before `config`
    // — the only point early enough to reach page_view/session_start.
    // This call re-sets it from the bundle's own cookie parser, which
    // covers a stub-regex miss and costs nothing when it agrees. The
    // callback below is the only path that works for a first-ever
    // visitor, who has no cookie for either parser to read.
    setUserCidProperty()
    // Ask GA for this browser's client id so model-open events can
    // carry it as open_cid (see privacy/analytics#setGaClientId for
    // why). The call buffers in dataLayer like any other gtag call and
    // the callback fires once gtag/js has loaded and resolved the id —
    // so it never fires on a blocked client. Events fired before it
    // lands fall back to the _ga cookie in analytics#getGaClientId.
    window.gtag('get', GA_MEASUREMENT_ID, 'client_id', (cid) => {
      setGaClientId(cid)
      // The only path that works for a first-ever visitor, who had no
      // cookie for the call above to read.
      setUserCidProperty()
    })
  } catch (err) {
    captureException(err, {tags: {subsystem: 'ga_init'}})
  }
}
