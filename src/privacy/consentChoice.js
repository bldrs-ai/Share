import {updateGaConsent} from '../index/ga'
import {setConsent} from './analytics'
import {CONSENT_LEVELS, isConsentDecided} from './consent'


/**
 * Apply a privacy level the visitor chose: store it, re-sync the
 * identifiers that follow consent (analytics#setConsent), and load or
 * silence the GA tag to match (ga#updateGaConsent).
 *
 * Its own module because analytics.js can't import index/ga.js (ga.js
 * imports analytics.js). UI calls this, never the two halves alone.
 *
 * @param {string} level one of consent#CONSENT_LEVELS
 */
export default function chooseConsentLevel(level) {
  setConsent(level)
  updateGaConsent()
}


/**
 * The About dialog closed without OK (Cancel, X, backdrop, Escape, or the
 * logo button toggling it shut). For a visitor who hasn't chosen yet that
 * is a decline: store Browse only, so nothing is collected and the dialog
 * doesn't re-open on every load. A visitor who already chose keeps their
 * choice; closing just discards the slider's unconfirmed position.
 */
export function dismissConsent() {
  if (!isConsentDecided()) {
    chooseConsentLevel(CONSENT_LEVELS.RESTRICTED)
  }
}
