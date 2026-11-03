import Cookies from 'js-cookie'
import {captureException} from '@sentry/react'
import {isAllowed, setGaClientId, setUserCidProperty, syncSentryCidTag} from '../privacy/analytics'
import {isFeatureEnabled} from '../FeatureFlags'


// Must match the ID in public/index.html's inline gtag('config') stub —
// the stub routes buffered events to the property, this constant only
// fetches the loader. A property migration has to update both.
export const GA_MEASUREMENT_ID = 'G-GRLNVMZRGW'

// Apex is canonical; www is included in case a client renders before
// any redirect settles. Everything else — localhost, *.netlify.app
// previews/dev, GitHub Pages installs — must not feed prod analytics.
const PROD_HOSTNAMES = ['bldrs.ai', 'www.bldrs.ai']

// Deploy previews of bldrs' own Netlify project only (the one that serves
// bldrs.ai; cf. tools/live-smoke/targets.js#LIVE_NETLIFY_PROJECTS). Any
// other Netlify site, a fork's included, gets the same `deploy-preview-N--`
// shape, and must not be able to opt into the production property.
const DEPLOY_PREVIEW_HOSTNAME = /^deploy-preview-\d+--bldrs-share-prod\.netlify\.app$/


/**
 * True when this page should load Google Analytics: production hosts, or a
 * manually opted-in Netlify deploy preview, and never under automation
 * (Playwright/Selenium/Puppeteer set navigator.webdriver). Other off-prod and
 * automated traffic polluted the metrics Google Ads bids on — see
 * design/roadmap.md grow-120 and the matching event-level guard in
 * privacy/analytics#isRealModelOpen.
 *
 * @param {object} [env] overrides for tests
 * @param {string} [env.hostname]
 * @param {boolean} [env.isWebdriver]
 * @param {boolean} [env.enableInPreview]
 * @return {boolean}
 */
export function shouldInitGa({
  hostname = window.location.hostname,
  isWebdriver = navigator.webdriver === true,
  enableInPreview = isFeatureEnabled('gaEnableInPreview'),
} = {}) {
  const isDeployPreview = DEPLOY_PREVIEW_HOSTNAME.test(hostname)
  return (PROD_HOSTNAMES.includes(hostname) || (isDeployPreview && enableInPreview)) && !isWebdriver
}


/*
 * Google Consent Mode v2 signals. index.html's inline stub declares the
 * same two objects before the bundle loads (DEFAULT first, then GRANTED
 * for a visitor whose cookie already consents); consent.test.js runs the
 * stub and compares them with these, so the copies can't drift.
 *
 * ad_storage + ad_user_data are what let a consenting visitor's GA4 key
 * events count as Google Ads conversions. ad_personalization stays denied
 * even when granted: it's remarketing / personalized ads, which no level's
 * wording in the dialog asks for.
 */
export const CONSENT_DEFAULT = Object.freeze({
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
})
export const CONSENT_GRANTED = Object.freeze({
  analytics_storage: 'granted',
  ad_storage: 'granted',
  ad_user_data: 'granted',
  ad_personalization: 'denied',
})


// GA's documented per-property kill switch. gtag/js checks it before
// sending, which is the only way to silence a tag that has already loaded
// (it can't be unloaded) when a visitor withdraws mid-page.
const GA_DISABLE_KEY = `ga-disable-${GA_MEASUREMENT_ID}`


// First-party cookies the GA and Ads tags write: `_ga`, `_ga_<container>`,
// and the conversion linker's `_gcl_*`.
const GOOGLE_COOKIE_PATTERN = /^(_ga(_|$)|_gcl_)/


let isGtagLoaded = false
// setupGa's env, kept so a later updateGaConsent (the dialog's OK) makes
// the same host decision setupGa did.
let gaEnv


/**
 * Called once at bundle start. Loads Google Analytics only when this host
 * may (shouldInitGa) AND the visitor has already consented. A visitor who
 * hasn't chosen yet gets nothing from Google: no gtag/js request, no
 * cookie, no collect. If they then allow analytics in the About dialog,
 * updateGaConsent loads it on the spot. Design:
 * design/new/analytics-consent.md.
 *
 * index.html keeps the inline dataLayer/gtag stub unconditionally
 * (gtagEvent calls buffer there, and the E2E suite asserts against that
 * buffer on localhost); the stub only queues, it never sends anything.
 *
 * @param {object} [env] overrides for tests, forwarded to shouldInitGa
 */
export default function setupGa(env = undefined) {
  gaEnv = env
  if (!shouldInitGa(env) || !isAllowed()) {
    return
  }
  loadGtag(env)
}


/**
 * Bring the GA tag into line with the stored consent, after the visitor
 * chooses in the About dialog (privacy/consentChoice.js).
 *
 * Allowed: clear the kill switch, update consent to granted, queue the
 * `config` the stub withheld (it only queues one for a visitor who had
 * already consented), and load gtag/js if this host may. Collection
 * starts without a reload.
 *
 * Not allowed: set the kill switch, update consent to denied, and delete
 * the GA cookies. A tag loaded earlier in this page can't be unloaded,
 * but with ga-disable set it sends nothing more; after a reload it isn't
 * loaded at all.
 *
 * @param {object} [env] overrides for tests, forwarded to shouldInitGa
 */
export function updateGaConsent(env = gaEnv) {
  if (typeof window.gtag !== 'function') {
    return
  }
  if (!isAllowed()) {
    window[GA_DISABLE_KEY] = true
    window.gtag('consent', 'update', {...CONSENT_DEFAULT})
    deleteGoogleCookies(env?.hostname)
    return
  }
  window[GA_DISABLE_KEY] = false
  window.gtag('consent', 'update', {...CONSENT_GRANTED})
  const isConfigQueued = Array.isArray(window.dataLayer) &&
    window.dataLayer.some((entry) => entry?.[0] === 'config' && entry?.[1] === GA_MEASUREMENT_ID)
  if (!isConfigQueued) {
    window.gtag('config', GA_MEASUREMENT_ID)
  }
  if (!isGtagLoaded && shouldInitGa(env)) {
    loadGtag(env)
  }
}


/**
 * Delete the GA/Ads first-party cookies. gtag writes them on the widest
 * domain it can (`cookie_domain: 'auto'`, so `.bldrs.ai` for a page on
 * bldrs.ai), and a cookie only goes away when removed with the domain it
 * was set with, so every parent domain is tried; removing with a domain
 * that doesn't apply is a no-op.
 *
 * @param {string} [hostname]
 */
export function deleteGoogleCookies(hostname = window.location.hostname) {
  const names = Object.keys(Cookies.get()).filter((name) => GOOGLE_COOKIE_PATTERN.test(name))
  const labels = hostname.split('.')
  const domains = [undefined]
  for (let i = 0; i < labels.length - 1; i++) {
    domains.push(labels.slice(i).join('.'))
  }
  for (const name of names) {
    for (const domain of domains) {
      Cookies.remove(name, domain ? {path: '/', domain} : {path: '/'})
    }
  }
}


/**
 * Inject the gtag/js loader.
 *
 * Any init failure is reported to Sentry tagged subsystem:ga_init so
 * we can see when prod loses its Ads-conversion signal. The expected
 * steady-state noise here is ad-blocker users failing the script load;
 * keep the tag stable so a future sentry.js filter (or a GA-side
 * blocked-client event, cf. netlify_rum_blocked) can key off it.
 *
 * @param {object} [env] overrides for tests
 */
function loadGtag(env) {
  try {
    const hostname = env?.hostname ?? window.location.hostname
    const enableInPreview = env?.enableInPreview ?? isFeatureEnabled('gaEnableInPreview')
    const isPreviewSmokeTest = DEPLOY_PREVIEW_HOSTNAME.test(hostname) && enableInPreview
    if (isPreviewSmokeTest) {
      // Unlike GA DebugView, this remains visible when Brave/Shields or an
      // extension blocks googletagmanager.com, making that failure explicit.
      // eslint-disable-next-line no-console
      console.info('[ga] preview smoke test enabled; browser privacy tools may still block GA requests')
    }
    // The stub is declared inline in index.html before the bundle
    // loads; its absence means the bootstrap contract broke.
    if (typeof window.gtag !== 'function' || !Array.isArray(window.dataLayer)) {
      throw new Error('ga_init: gtag bootstrap missing — index.html inline stub did not run')
    }
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
    script.onerror = () => {
      if (isPreviewSmokeTest) {
        console.warn('[ga] gtag/js was blocked; allow googletagmanager.com and reload to send events')
      }
      captureException(
        new Error('ga_init: gtag/js failed to load (blocked client or network failure)'),
        {tags: {subsystem: 'ga_init'}},
      )
    }
    document.head.appendChild(script)
    isGtagLoaded = true
    // Second of three places the user property is published, each for a
    // distinct reason. index.html's inline stub sets it before `config`
    // — the only point early enough to reach page_view/session_start.
    // This call re-sets it from the bundle's own cookie parser, which
    // covers a stub-regex miss and costs nothing when it agrees. The
    // callback below is the only path that works for a first-ever
    // visitor, who has no cookie for either parser to read.
    setUserCidProperty()
    // The Sentry half of the same id, on the same two-call shape and for
    // the same reason: this one reads the `_ga` cookie, so a *returning*
    // visitor's tag is in place from first paint and a load-failure
    // exception thrown before gtag/js resolves still carries it. It is
    // the only join between Sentry and the bizdev dashboard's model-open
    // chips (issue #1767); see analytics#syncSentryCidTag.
    syncSentryCidTag()
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
      syncSentryCidTag()
    })
  } catch (err) {
    captureException(err, {tags: {subsystem: 'ga_init'}})
  }
}


/** Test-only reset of the module's load state. */
export function _resetGaForTests() {
  isGtagLoaded = false
  gaEnv = undefined
  delete window[GA_DISABLE_KEY]
}
