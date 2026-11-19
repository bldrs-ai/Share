import {captureException} from '@sentry/react'
import {setGaClientId, setUserCidProperty, syncSentryCidTag} from '../privacy/analytics'
import {reportClientCapability} from '../privacy/clientCapabilities'
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


/**
 * Inject the gtag/js loader when shouldInitGa allows. index.html keeps
 * the inline dataLayer/gtag stub unconditionally (gtagEvent calls
 * buffer there, and the E2E suite asserts against that buffer on
 * localhost), so off-prod the app behaves identically minus the
 * network beacon.
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
 * @param {object} [env] overrides for tests, forwarded to shouldInitGa
 */
export default function setupGa(env = undefined) {
  if (!shouldInitGa(env)) {
    return
  }
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
