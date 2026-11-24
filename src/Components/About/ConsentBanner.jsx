import React, {ReactElement} from 'react'
import {Box, Button, Link, Paper, Stack, Typography} from '@mui/material'
import {CONSENT_LEVELS} from '../../privacy/consent'
import chooseConsentLevel from '../../privacy/consentChoice'
import {LOCAL_ONLY_MODE_NAME} from '../../privacy/localOnlyMode'
import useStore from '../../store/useStore'


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
export const CONSENT_TEXT =
  'Bldrs opens files in your browser; they’re never uploaded to our servers. To improve Bldrs, we’d ' +
  'like to measure visits and feature use, like which kinds of models are opened (format, size, source), ' +
  'with Google Analytics, which sets cookies holding a pseudonymous ID. No advertising. If you decline, ' +
  `Bldrs runs in ${LOCAL_ONLY_MODE_NAME}: files from your computer and the sample models. Error reports ` +
  'stay on either way.'


/** Served by the marketing build (netlify.toml: /privacy/ is a file match). */
export const PRIVACY_POLICY_HREF = '/privacy/'


/** What a visitor who reopens the banner already chose. */
const CURRENT_CHOICE = Object.freeze({
  [CONSENT_LEVELS.FUNCTIONAL]: 'You accepted.',
  [CONSENT_LEVELS.RESTRICTED]: 'You declined.',
})


/**
 * Shown while the store's `isConsentBannerVisible` is set: on every load
 * until the visitor answers (UISlice), and again from Privacy settings
 * (About, Open/LocalOnlyDialog) so a choice can be changed as easily as it
 * was made. Held back while About or the first-visit onboarding overlay
 * (zIndex 9999, OnboardingOverlay.jsx) is up, which would cover it: a
 * first-timer gets the welcome, then the tour, then this.
 *
 * @return {ReactElement|null}
 */
export default function ConsentBanner() {
  const isVisible = useStore((state) => state.isConsentBannerVisible)
  const setIsVisible = useStore((state) => state.setIsConsentBannerVisible)
  const isAboutVisible = useStore((state) => state.isAboutVisible)
  const isOnboardingVisible = useStore((state) => state.isOnboardingOverlayVisible)
  const privacyLevel = useStore((state) => state.privacyLevel)
  if (!isVisible || isAboutVisible || isOnboardingVisible) {
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
        justifyContent: 'center',
        px: '16px',
        // Above the canvas, the controls and the drawers, under any dialog
        // (Theme.jsx raises modal to 2000), and it's not a modal: the page
        // behind it stays usable, drag-and-drop included.
        zIndex: 1250,
        pointerEvents: 'none',
      }}
    >
      <Paper
        elevation={6}
        role='region'
        aria-label='Privacy choice'
        data-testid='consent-banner'
        sx={{maxWidth: '40em', width: '100%', p: '1em', pointerEvents: 'auto'}}
      >
        <Typography variant='body2' sx={{textAlign: 'left'}} data-testid='consent-summary'>
          <strong>{CONSENT_HEADLINE}</strong> {CONSENT_TEXT}{' '}
          {CURRENT_CHOICE[privacyLevel] && <>{CURRENT_CHOICE[privacyLevel]}{' '}</>}
          {/* The marketing site's static page. A new tab, so reading the
              policy doesn't leave the loaded model mid-choice. */}
          <Link
            href={PRIVACY_POLICY_HREF}
            target='_blank'
            rel='noopener noreferrer'
            color='inherit'
            sx={{whiteSpace: 'nowrap'}}
            data-testid='consent-privacy-link'
          >
            Privacy policy
          </Link>
        </Typography>
        {/* Decline and Accept side by side, same size and the same style, so
            declining is as easy and as visible as accepting. An outlined
            Decline read as disabled next to a filled Accept on the preview,
            the visual nudge consent guidance calls a dark pattern. */}
        <Stack direction='row' spacing={1} justifyContent='flex-end' sx={{mt: '0.75em'}}>
          <Button
            variant='contained'
            onClick={() => answer(CONSENT_LEVELS.RESTRICTED)}
            data-testid='consent-decline'
          >
            Decline
          </Button>
          <Button
            variant='contained'
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
