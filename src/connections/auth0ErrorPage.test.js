import {readFileSync} from 'fs'
import path from 'path'
import {describe as describeQuery, render, supportHref} from '../../public/auth/error/error'


// The Auth0 custom error page is a static file, not app code
// (public/auth/error/, design in its index.html header). This drives its
// script against its own markup in jsdom; auth0ErrorPage.spec.ts loads the
// real page in a browser.
const PAGE_HTML = readFileSync(path.resolve(__dirname, '../../public/auth/error/index.html'), 'utf8')
// error.js caps the description at 300 characters, then appends an ellipsis.
const MAX_DESCRIPTION = 300
const XSS = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>'


/**
 * Reset the document to the error page's markup. innerHTML never runs the
 * page's <script> tag, so render() below is the only script that acts.
 */
function loadPage() {
  document.documentElement.innerHTML = PAGE_HTML.replace(/^[\s\S]*?<html[^>]*>/, '').replace(/<\/html>\s*$/, '')
}


/**
 * @param {string} id
 * @return {HTMLElement}
 */
function byId(id) {
  return document.getElementById(id)
}


/**
 * @return {URLSearchParams} the support link's mailto query
 */
function mailtoParams() {
  const href = byId('auth-error-support').getAttribute('href')
  expect(href.startsWith('mailto:support@bldrs.ai?')).toBe(true)
  return new URLSearchParams(href.slice(href.indexOf('?') + 1))
}


describe('connections/auth0ErrorPage', () => {
  beforeEach(() => {
    loadPage()
    delete window.__pwned
  })

  it('shows the mapped message, error code and tracking id for a known error', () => {
    render(document, '?error=access_denied&error_description=User%20cancelled&tracking=abc123&connection=github')

    expect(byId('auth-error-message').textContent).toMatch(/cancelled/)
    expect(byId('auth-error-code').textContent).toBe('access_denied')
    expect(byId('auth-error-connection').textContent).toBe('GitHub')
    expect(byId('auth-error-tracking').textContent).toBe('abc123')
    expect(byId('auth-error-details').hidden).toBe(false)
    expect(byId('auth-error-quote').hidden).toBe(false)
    expect(mailtoParams().get('subject')).toBe('Sign-in problem (abc123)')
  })

  it('never puts error_description on the page, only in the support email body', () => {
    render(document, `?error=access_denied&tracking=abc123&error_description=${encodeURIComponent(XSS)}`)

    expect(document.body.textContent).not.toContain('onerror')
    expect(document.querySelectorAll('img').length).toBe(1) // the logo
    expect(document.querySelectorAll('script').length).toBe(1) // the page's own, inert here
    expect(window.__pwned).toBeUndefined()
    // The draft carries it as plain text the user reads before sending.
    expect(mailtoParams().get('body')).toContain('Description: <img src=x onerror="window.__pwned=1">')
  })

  it('drops, rather than escapes, values outside the allowlist', () => {
    render(document,
      `?error=${encodeURIComponent(XSS)}&tracking=${encodeURIComponent('abc<b>123</b>')}` +
      `&connection=${encodeURIComponent('"><svg>')}`)

    expect(byId('auth-error-code-row').hidden).toBe(true)
    expect(byId('auth-error-tracking-row').hidden).toBe(true)
    expect(byId('auth-error-connection-row').hidden).toBe(true)
    expect(byId('auth-error-details').hidden).toBe(true)
    expect(byId('auth-error-quote').hidden).toBe(true)
    expect(byId('auth-error-message').textContent).toMatch(/Something went wrong/)
    expect(document.querySelector('svg, b')).toBeNull()
    expect(mailtoParams().get('body')).toContain('Tracking ID: (none)')
  })

  it('falls back to the generic message for an unknown code but still shows the code', () => {
    render(document, '?error=some_new_code&tracking=t-1')

    expect(byId('auth-error-message').textContent).toMatch(/Something went wrong/)
    expect(byId('auth-error-code').textContent).toBe('some_new_code')
  })

  it('does not let a prototype key pick a message', () => {
    expect(describeQuery('?error=constructor').message).toMatch(/Something went wrong/)
    expect(describeQuery('?connection=__proto__').connectionLabel).toBe('')
  })

  it('maps each group of Auth0 codes to its own message', () => {
    expect(describeQuery('?error=consent_required').message).toMatch(/confirm sign-in again/)
    expect(describeQuery('?error=invalid_request').message).toMatch(/our side/)
    expect(describeQuery('?error=temporarily_unavailable').message).toMatch(/Wait a moment/)
  })

  it('keeps the no-query page as the generic fallback', () => {
    render(document, '')

    expect(byId('auth-error-details').hidden).toBe(true)
    expect(byId('auth-error-copy').hidden).toBe(true)
    expect(mailtoParams().get('subject')).toBe('Sign-in problem')
  })

  it('flattens and caps error_description for the email', () => {
    const info = describeQuery(`?error_description=${encodeURIComponent(`a\nb\u202Ec${'x'.repeat(MAX_DESCRIPTION + MAX_DESCRIPTION)}`)}`)

    expect(info.description.startsWith('a b c')).toBe(true)
    expect(info.description).not.toMatch(/[\n\u202E]/)
    expect(info.description.length).toBe(MAX_DESCRIPTION + 1)
    expect(supportHref(info)).not.toContain('%E2%80%AE')
  })

  it('copies the tracking id when the clipboard is available', async () => {
    const writeText = jest.fn(() => Promise.resolve())
    render(document, '?tracking=abc123', {clipboard: {writeText}})

    const copy = byId('auth-error-copy')
    expect(copy.hidden).toBe(false)
    copy.click()
    await Promise.resolve()
    await Promise.resolve()

    expect(writeText).toHaveBeenCalledWith('abc123')
    expect(copy.textContent).toBe('Copied')
  })
})
