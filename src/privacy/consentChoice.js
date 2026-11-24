import {updateGaConsent} from '../index/ga'
import useStore from '../store/useStore'
import {setConsent} from './analytics'


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
  // The store's mirror, which the local-only gates read (UISlice).
  useStore.getState().setPrivacyLevel(level)
}

