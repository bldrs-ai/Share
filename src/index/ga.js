import Cookies from 'js-cookie'
import {captureException} from '@sentry/react'
import {isAllowed, setGaClientId, setUserCidProperty, syncSentryCidTag} from '../privacy/analytics'
import {reportClientCapability} from '../privacy/clientCapabilities'
import {isFeatureEnabled} from '../FeatureFlags'


// Must match the ID in public/index.html's inline gtag('config') stub —
// the stub routes buffered events to the property, this constant only
// fetches the loader. A property migration has to update both.
export const GA_MEASUREMENT_ID = 'G-GRLNVMZRGW'

/*
 * Google Analytics in the browser is OFF (owner, 2026-11-25): gtag/js is
 * never loaded, for anyone, and no consent is asked. Usage is measured
 * without it: cookieless, ID-free reports to our own server
 * (privacy/modelOpenCount.js and netlify/functions/model-open-count.js,
 * #2355), which passes them to GA4 under one fixed id, plus server-side
 * per-account and metering records. design/new/analytics-consent.md says
 * why and what a later opt-in would turn back on. This one switch, and the
 * loader below it, are kept for that opt-in; setupGa's tests run the
 * loader with it on.
 */
export const IS_BROWSER_GA_ON = false


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
 * automated traffic polluted the analytics (and, while Google Ads ran, the
 * metrics it bid on; history only) — see
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


/**
 * True on a host where this app's GA tag could ever have run: production,
 * or one of bldrs' own deploy previews (whether or not this load opted in).
 * Leftover GA cookies are only ours to delete there. A self-hosted Share
 * under someone else's site (share.example.com) never ran our tag, and
 * the `_ga` on example.com belongs to that site's own analytics.
 *
 * @param {string} hostname
 * @return {boolean}
 */
export function isOwnGaHost(hostname) {
  return PROD_HOSTNAMES.includes(hostname) || DEPLOY_PREVIEW_HOSTNAME.test(hostname)
}


/*
 * Google Consent Mode v2 signals. index.html's inline stub declares the
 * same two objects before the bundle loads (DEFAULT first, then GRANTED
 * for a visitor whose cookie already consents); consent.test.js runs the
 * stub and compares them with these, so the copies can't drift.
 *
 * Consent grants analytics_storage only. Every ad signal stays denied at
 * every level: Google Ads is switched off (2026-11), so nothing may store
 * ad cookies, send user data to Ads, or personalize ads. Used only while
 * browser GA is on (IS_BROWSER_GA_ON).
 */
export const CONSENT_DEFAULT = Object.freeze({
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
})
export const CONSENT_GRANTED = Object.freeze({
  analytics_storage: 'granted',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
})


/*
 * Fields every `config` call carries, the stub's included (consent.test.js
 * checks it). Belt and braces with the denied ad signals above: Google
 * signals is what sends GA data to doubleclick.net for cross-device and
 * demographics reporting, and ad-personalization signals are what Ads
 * remarketing reads. Both off, since Ads is off.
 */
export const GA_CONFIG = Object.freeze({
  allow_google_signals: false,
  allow_ad_personalization_signals: false,
})


// First-party cookies the GA tag writes, `_ga` and `_ga_<container>`, plus
// the Ads conversion linker's `_gcl_*`. Ads is off and nothing grants
// ad_storage, so no new `_gcl_*` is written; it's here for leftovers from
// when it ran.
const GOOGLE_COOKIE_PATTERN = /^(_ga(_|$)|_gcl_)/


/**
 * Called once at bundle start. While browser GA is off (IS_BROWSER_GA_ON)
 * it only clears leftovers: GA ran for every visitor until 2026-11, and
 * for consenting ones until 2026-11-25, so a returning browser may still
 * hold `_ga` / `_ga_*` / `_gcl_*`. deleteGoogleCookies only touches our own
 * GA hosts. With the switch on (a later opt-in), it loads Google Analytics
 * only when this host may (shouldInitGa) AND the visitor has consented.
 *
 * index.html keeps the inline dataLayer/gtag stub unconditionally
 * (gtagEvent calls buffer there, and the E2E suite asserts against that
 * buffer on localhost); the stub only queues, it never sends anything.
 *
 * @param {object} [env] overrides for tests, forwarded to shouldInitGa
 * @param {boolean} [env.isBrowserGaOn] overrides IS_BROWSER_GA_ON
 */
export default function setupGa(env = undefined) {
  const isOn = env?.isBrowserGaOn ?? IS_BROWSER_GA_ON
  if (!isOn || !isAllowed()) {
    deleteGoogleCookies(env?.hostname)
    return
  }
  if (!shouldInitGa(env)) {
    return
  }
  loadGtag(env)
}


/**
 * Delete the GA/Ads first-party cookies. gtag wrote them on the widest
 * domain it can (`cookie_domain: 'auto'`, so `.bldrs.ai` for a page on
 * bldrs.ai), and a cookie only goes away when removed with the domain it
 * was set with, so every parent domain is tried; removing with a domain
 * that doesn't apply is a no-op.
 *
 * A no-op off our own GA hosts (isOwnGaHost). The gate lives here rather
 * than at the callers so that no path can reach a host site's cookies: on a
 * self-hosted share.example.com, the `_ga` on example.com is that site's
 * analytics, which isn't ours to clear.
 *
 * @param {string} [hostname]
 */
export function deleteGoogleCookies(hostname = window.location.hostname) {
  if (!isOwnGaHost(hostname)) {
    return
  }
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
 * Inject the gtag/js loader. Only ever reached with browser GA on and
 * consent (setupGa), so the `ga_blocked` count below covers consenting
 * visitors only, and none while the switch is off.
 *
 * A script that fails to load is the expected state of a blocked client
 * (an ad blocker, a privacy browser, a DNS filter), not something to fix,
 * so it is not a Sentry event (AGENTS.md, Reported Conditions). It is
 * counted instead as a `ga_blocked` client-capability report, sent to
 * Share's own origin and passed to GA from the server
 * (privacy/clientCapabilities.js, netlify/functions/client-capabilities.js),
 * which also shows a real tag outage as a spike. Any other init failure
 * (the inline stub missing, a throw below) is a defect and goes to Sentry,
 * fingerprinted as one `ga_init` issue: its stack varies by build, and it
 * split into an issue per release before (SHARE-1M1 and its copies).
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
      reportClientCapability('ga_blocked')
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
    captureException(err, {tags: {subsystem: 'ga_init'}, fingerprint: ['ga_init', String(err?.message ?? err)]})
  }
}
