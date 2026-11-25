import React, {ReactElement, useState} from 'react'
import {Box, Button, Link, Paper, Stack, Typography} from '@mui/material'
import {CONSENT_LEVELS} from '../../privacy/consent'
import chooseConsentLevel from '../../privacy/consentChoice'
import {LOCAL_ONLY_MODE_NAME} from '../../privacy/localOnlyMode'
import useStore from '../../store/useStore'
import {useIsMobile} from '../Hooks'


/*
 * The privacy choice, as a banner at the foot of the page rather than a
 * dialog (2026-11-24). #2051 asked in the About dialog, which blocked the
 * canvas before a first file could be dropped, and stored any close but OK
 * as a decline, so a visitor who closed it to get to their model found
 * GitHub and Drive links refused. About is a welcome again; this banner
 * asks, never blocks, and has no close: it stays until Accept or Decline.
 * Until then nothing is collected (index/ga.js) and nothing is refused
 * (privacy/localOnlyMode.js reads only a stored `restricted`).
 *
 * The text is the "informed" part of the consent, so it has to stay true to
 * what each answer does (privacy/consent.js, index/ga.js,
 * privacy/localOnlyMode.js) and to the privacy policy's §1 (src/pages/
 * Privacy.jsx and its marketing copy). Change them together. Local-first
 * framing, what never leaves the device first, per the owner's 2026-11-24
 * feedback round; design/new/analytics-consent.md §"The banner". Short, but
 * it names everything Accept turns on (GA, its cookies, what is measured)
 * and what Decline leaves on (error reports), as the policy does: a shorter
 * first cut left those to the policy link, which made the choice less than
 * informed (codex on #2354).
 */
export const CONSENT_HEADLINE = 'Your models stay on your device.'
/**
 * The first layer: what Accept turns on (Google Analytics, its cookies, for
 * measuring use, no ads) and what Decline costs, concretely: the mode's
 * name alone ("Test only mode") left the cost undefined (codex on #2354). The
 * owner found the full paragraph imposing (2026-11-24), and layered notice
 * is the accepted shape: the essentials up front, the rest one click away
 * (CONSENT_TEXT, behind Details) and in the policy.
 */
export const CONSENT_SHORT_TEXT =
  'May we measure usage with Google Analytics cookies? No ads. Declining limits Bldrs to local files and ' +
  'samples: no GitHub, Drive or link models, saving or sharing.'
/** The second layer, behind Details: everything, as the policy's §1 says it. */
export const CONSENT_TEXT =
  'Bldrs opens files in your browser; they’re never uploaded to our servers. To improve Bldrs, we’d ' +
  'like to measure visits and feature use, like which kinds of models are opened (format, size, source), ' +
  'with Google Analytics, which sets cookies holding a pseudonymous ID. No advertising. If you decline, ' +
  `Bldrs runs in ${LOCAL_ONLY_MODE_NAME}: files from your computer and the sample models. Error reports ` +
  'stay on either way.'


/** Served by the marketing build (netlify.toml: /privacy/ is a file match). */
export const PRIVACY_POLICY_HREF = '/privacy/'


// OnboardingOverlay.jsx's zIndex.
export const ONBOARDING_OVERLAY_Z = 9999
// Above the drawers (MUI 1200), under dialogs (Theme.jsx modal 2000).
export const BANNER_Z = 1250


/** What a visitor who reopens the banner already chose. */
const CURRENT_CHOICE = Object.freeze({
  [CONSENT_LEVELS.FUNCTIONAL]: 'You accepted.',
  [CONSENT_LEVELS.RESTRICTED]: 'You declined.',
})


/**
 * Shown while the store's `isConsentBannerVisible` is set: on every load
 * until the visitor answers (UISlice), and again from Privacy settings
 * (About, Open/LocalOnlyDialog) so a choice can be changed as easily as it
 * was made. Held back while About is open (its Privacy settings link is the
 * way here from it). Not held back by the first-visit onboarding tour
 * (OnboardingOverlay.jsx, zIndex 9999): a first-timer's About closes
 * straight into the tour, Privacy settings included, so waiting behind it
 * made Privacy settings look like a no-op (owner, on the #2354 preview).
 * While the tour is up the banner sits above it instead.
 *
 * @return {ReactElement|null}
 */
export default function ConsentBanner() {
  const isVisible = useStore((state) => state.isConsentBannerVisible)
  const setIsVisible = useStore((state) => state.setIsConsentBannerVisible)
  const isAboutVisible = useStore((state) => state.isAboutVisible)
  const isOnboardingVisible = useStore((state) => state.isOnboardingOverlayVisible)
  const privacyLevel = useStore((state) => state.privacyLevel)
  const isMobile = useIsMobile()
  const [isDetailed, setIsDetailed] = useState(false)
  if (!isVisible || isAboutVisible) {
    return null
  }
  // Both answers apply even when unchanged: re-choosing is harmless, and it
  // keeps one path for a first answer and a changed one.
  const answer = (level) => {
    chooseConsentLevel(level)
    setIsVisible(false)
  }
  return (
    <Box
      sx={{
        position: 'fixed',
        // Clear of the status bar, which renders above everything and is
        // taller than Dialog.jsx's 4em SNACKBAR_BAND with its padding
        // (measured on the #2354 preview: ~60px desktop, ~75px phone).
        bottom: '6em',
        left: 0,
        right: 0,
        display: 'flex',
        // A compact card in the corner on desktop, clear of the model;
        // full width (less the gutters) on a phone.
        justifyContent: isMobile ? 'center' : 'flex-end',
        px: '16px',
        // Above the canvas, the controls and the drawers, under any dialog
        // (Theme.jsx raises modal to 2000), and it's not a modal: the page
        // behind it stays usable, drag-and-drop included. Above the
        // onboarding tour (9999) only while the tour is up, so it is never
        // hidden behind it and never covers a dialog the rest of the time.
        zIndex: isOnboardingVisible ? ONBOARDING_OVERLAY_Z + 1 : BANNER_Z,
        pointerEvents: 'none',
      }}
    >
      <Paper
        elevation={6}
        role='region'
        aria-label='Privacy choice'
        data-testid='consent-banner'
        sx={{maxWidth: isDetailed ? '34em' : '26em', width: '100%', p: '0.75em 1em', pointerEvents: 'auto'}}
      >
        <Typography variant='body2' sx={{textAlign: 'left'}} data-testid='consent-summary'>
          <strong>{CONSENT_HEADLINE}</strong> {isDetailed ? CONSENT_TEXT : CONSENT_SHORT_TEXT}{' '}
          {CURRENT_CHOICE[privacyLevel] && <>{CURRENT_CHOICE[privacyLevel]}{' '}</>}
          {isDetailed ?
            // The marketing site's static page. A new tab, so reading the
            // policy doesn't leave the loaded model mid-choice.
            <Link
              href={PRIVACY_POLICY_HREF}
              target='_blank'
              rel='noopener noreferrer'
              color='inherit'
              sx={{whiteSpace: 'nowrap'}}
              data-testid='consent-privacy-link'
            >
              Privacy policy
            </Link> :
            <Link
              component='button'
              onClick={() => setIsDetailed(true)}
              color='inherit'
              sx={{verticalAlign: 'baseline', whiteSpace: 'nowrap'}}
              data-testid='consent-details'
            >
              Details
            </Link>}
        </Typography>
        {/* Decline and Accept side by side, same size and the same style, so
            declining is as easy and as visible as accepting. An outlined
            Decline read as disabled next to a filled Accept on the preview,
            the visual nudge consent guidance calls a dark pattern. */}
        <Stack direction='row' spacing={1} justifyContent='flex-end' sx={{mt: '0.5em'}}>
          <Button
            variant='contained'
            size='small'
            onClick={() => answer(CONSENT_LEVELS.RESTRICTED)}
            data-testid='consent-decline'
          >
            Decline
          </Button>
          <Button
            variant='contained'
            size='small'
            onClick={() => answer(CONSENT_LEVELS.FUNCTIONAL)}
            data-testid='consent-accept'
          >
            Accept
          </Button>
        </Stack>
      </Paper>
    </Box>
  )
}
