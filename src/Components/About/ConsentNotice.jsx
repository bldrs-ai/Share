import React, {ReactElement} from 'react'
import {Link, Typography} from '@mui/material'
import {LOCAL_ONLY_MODE_NAME} from '../../app/localOnlyMode'


/*
 * What the About (welcome) dialog asks. OK consents, Cancel declines
 * (AboutDialog). This is the "informed" part of that consent, so it has to
 * stay true to what the code does on each answer (privacy/consent.js,
 * index/ga.js, app/localOnlyMode.js) and to the privacy policy's §1
 * telemetry paragraphs (src/pages/Privacy.jsx and its marketing copy).
 * Change them together. Owner's wording, 2026-11-24.
 */
export const CONSENT_TEXT =
  'We collect analytics with a pseudonymous ID: visits, and which kinds of models are opened ' +
  `(format, size, source). No advertising. Press Cancel for ${LOCAL_ONLY_MODE_NAME}.`


/** Served by the marketing build (netlify.toml: /privacy/ is a file match). */
export const PRIVACY_POLICY_HREF = '/privacy/'


/**
 * The consent text in the About dialog, with a link to the policy.
 *
 * @return {ReactElement}
 */
export default function ConsentNotice() {
  // No heading, and the policy link closes the paragraph: the dialog is
  // tight on space and the text says what it's about (owner, 2026-11-24).
  return (
    <Typography
      variant='body2'
      color='text.secondary'
      sx={{width: '100%', textAlign: 'left'}}
      data-testid='consent-summary'
    >
      {CONSENT_TEXT}{' '}
      {/* The marketing site's static page, as in LogoMenu's links. The
          app has no /share/privacy route, so that path rendered nothing.
          A new tab, so reading the policy doesn't leave the dialog (and
          the loaded model) mid-choice. */}
      <Link
        href={PRIVACY_POLICY_HREF}
        target='_blank'
        rel='noopener noreferrer'
        color='inherit'
        // One unit at the end of the paragraph, never split across lines.
        sx={{whiteSpace: 'nowrap'}}
        data-testid='consent-privacy-link'
      >
        Privacy policy
      </Link>
    </Typography>
  )
}
