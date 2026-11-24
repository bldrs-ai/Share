/*
 * Auth0 custom error page (see index.html). Fills the page in from the query
 * Auth0 redirects with: error, error_description, tracking, client_id,
 * connection, lang.
 *
 * The query is untrusted: anyone can send a link to
 * bldrs.ai/auth/error/?error_description=<anything>. So:
 *  - Only `textContent` and attribute values we build ourselves are written,
 *    never markup.
 *  - error, tracking, client_id and connection are shown only if they match
 *    a tight charset allowlist; anything else is dropped, not escaped.
 *  - The user-facing message is chosen by the `error` code from a fixed table
 *    here; error_description is never shown. Rendering it, even as text,
 *    would let a crafted link put arbitrary words ("call this number…") on a
 *    bldrs.ai page. It is useful to support, though, so it goes, cleaned and
 *    capped, into the body of the support email draft, where the user sees it
 *    before anything is sent.
 *  - `lang` is ignored: the page is English-only.
 *
 * Shipped as-is from public/ (no build step), so plain browser JS. The
 * `module.exports` at the bottom is for src/connections/auth0ErrorPage.test.js.
 */
(function() {
  const SUPPORT_EMAIL = 'support@bldrs.ai'

  // Auth0's error codes (OAuth 2.0 / OIDC plus its own) grouped by what the
  // user can do about them. https://auth0.com/docs/customize/login-pages/custom-error-pages
  const MESSAGES = {
    cancelled: 'Sign-in was cancelled, or the account you chose didn\'t give Bldrs access. ' +
      'Try again from Share and approve the request.',
    retry: 'Your Google or GitHub account needs you to confirm sign-in again. ' +
      'Try again from Share.',
    ours: 'The sign-in request wasn\'t valid. This is a problem on our side, not yours. ' +
      'Please email support with the tracking ID below.',
    unavailable: 'The sign-in service had a problem. Wait a moment, then try again from Share.',
    unknown: 'Something went wrong while signing you in. Try again from Share, or ' +
      'contact support if it keeps happening.',
  }
  const MESSAGE_BY_ERROR = {
    access_denied: 'cancelled',
    login_required: 'retry',
    consent_required: 'retry',
    interaction_required: 'retry',
    invalid_request: 'ours',
    invalid_scope: 'ours',
    invalid_client: 'ours',
    invalid_host: 'ours',
    unauthorized_client: 'ours',
    unsupported_response_type: 'ours',
    unsupported_response_mode: 'ours',
    server_error: 'unavailable',
    temporarily_unavailable: 'unavailable',
  }

  // Auth0 connection names → what the user picked on the login page.
  const CONNECTION_LABELS = {
    'github': 'GitHub',
    'google-oauth2': 'Google',
  }

  const ERROR_CODE_RE = /^[A-Za-z0-9_.-]{1,64}$/
  const TRACKING_RE = /^[A-Za-z0-9_-]{1,128}$/
  const CLIENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
  const CONNECTION_RE = /^[A-Za-z0-9_.-]{1,64}$/
  const MAX_DESCRIPTION_LENGTH = 300
  // C0/C1 controls, zero-width marks and the bidi embeddings, overrides and
  // isolates. Built from a string so the source stays plain ASCII
  // (`eslint --fix` rewrites \u escapes inside a regex literal into the raw
  // invisible characters). Matching control characters is the point here.
  // eslint-disable-next-line no-control-regex
  const UNPRINTABLE_RE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069]', 'g')


  /**
   * @param {string|null} value
   * @param {RegExp} re
   * @return {string} value trimmed if it matches re, else ''
   */
  function allow(value, re) {
    if (typeof value !== 'string') {
      return ''
    }
    const trimmed = value.trim()
    return re.test(trimmed) ? trimmed : ''
  }


  /**
   * Plain one-line text for the email draft: control characters (incl. bidi
   * overrides and newlines) become spaces, runs of whitespace collapse, and
   * the result is capped.
   *
   * @param {string|null} value
   * @return {string}
   */
  function cleanDescription(value) {
    if (typeof value !== 'string') {
      return ''
    }
    const flat = value
      .replace(UNPRINTABLE_RE, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return flat.length > MAX_DESCRIPTION_LENGTH ?
      `${flat.slice(0, MAX_DESCRIPTION_LENGTH)}…` :
      flat
  }


  /**
   * @param {string} search location.search, e.g. '?error=access_denied&…'
   * @return {object} the allowlisted, display-safe view of the query
   */
  function describe(search) {
    const params = new URLSearchParams(search || '')
    const error = allow(params.get('error'), ERROR_CODE_RE)
    const connection = allow(params.get('connection'), CONNECTION_RE)
    const messageKey = Object.prototype.hasOwnProperty.call(MESSAGE_BY_ERROR, error) ?
      MESSAGE_BY_ERROR[error] :
      'unknown'
    return {
      error: error,
      tracking: allow(params.get('tracking'), TRACKING_RE),
      clientId: allow(params.get('client_id'), CLIENT_ID_RE),
      connection: connection,
      connectionLabel: Object.prototype.hasOwnProperty.call(CONNECTION_LABELS, connection) ?
        CONNECTION_LABELS[connection] :
        '',
      description: cleanDescription(params.get('error_description')),
      message: MESSAGES[messageKey],
    }
  }


  /**
   * @param {object} info from describe()
   * @return {string} mailto: URL for a support email prefilled with info
   */
  function supportHref(info) {
    const subject = info.tracking ? `Sign-in problem (${info.tracking})` : 'Sign-in problem'
    const lines = [
      'What I was doing when sign-in failed:',
      '',
      '',
      '--- Details from the error page ---',
      `Tracking ID: ${info.tracking || '(none)'}`,
      `Error: ${info.error || '(none)'}`,
      `Connection: ${info.connection || '(none)'}`,
      `Client: ${info.clientId || '(none)'}`,
      `Description: ${info.description || '(none)'}`,
    ]
    return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(lines.join('\n'))}`
  }


  /**
   * @param {Document} doc
   * @param {string} id
   * @param {string} text shown (as text) in the element; its row is
   *   revealed only when text is non-empty
   * @return {boolean} whether the row is shown
   */
  function fillRow(doc, id, text) {
    const row = doc.getElementById(`${id}-row`)
    if (!text) {
      row.hidden = true
      return false
    }
    doc.getElementById(id).textContent = text
    row.hidden = false
    return true
  }


  /**
   * @param {Document} doc the error page's document
   * @param {string} search location.search
   * @param {object} [nav] navigator, for the clipboard
   */
  function render(doc, search, nav) {
    const info = describe(search)
    doc.getElementById('auth-error-message').textContent = info.message

    let anyShown = false
    anyShown = fillRow(doc, 'auth-error-code', info.error) || anyShown
    anyShown = fillRow(doc, 'auth-error-connection', info.connectionLabel) || anyShown
    const trackingShown = fillRow(doc, 'auth-error-tracking', info.tracking)
    anyShown = trackingShown || anyShown
    doc.getElementById('auth-error-details').hidden = !anyShown
    doc.getElementById('auth-error-quote').hidden = !trackingShown

    doc.getElementById('auth-error-support').setAttribute('href', supportHref(info))

    const copy = doc.getElementById('auth-error-copy')
    const clipboard = nav && nav.clipboard
    if (trackingShown && clipboard && typeof clipboard.writeText === 'function') {
      copy.hidden = false
      copy.onclick = () => {
        clipboard.writeText(info.tracking).then(() => {
          copy.textContent = 'Copied'
        }, () => {
          // Permission denied or no focus: the id is still selectable text.
        })
      }
    }
  }


  if (typeof module === 'object' && module.exports) {
    module.exports = {describe: describe, render: render, supportHref: supportHref}
  } else {
    render(document, window.location.search, window.navigator)
  }
})()
