import fs from 'fs'
import path from 'path'
import React from 'react'
import {render} from '@testing-library/react'
import {HelmetThemeCtx} from '../Share.fixture'
import Privacy from './Privacy'


// The policy has two copies: this page (/share/privacy) and the marketing
// site's (/privacy/, which is the one search and the footer link reach).
const MARKETING_POLICY = path.join(__dirname, '../../marketing/src/app/privacy/page.tsx')


/**
 * The marketing source reduced to the text it renders, for the paragraphs
 * this test compares: JSX comments and tags dropped, whitespace collapsed.
 *
 * @return {string}
 */
function marketingPolicyText() {
  return fs.readFileSync(MARKETING_POLICY, 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
}


describe('Privacy', () => {
  it('renders', () => {
    const {container, getByText} = render(<Privacy/>, {wrapper: HelmetThemeCtx})
    const title = getByText('Privacy Policy')
    expect(title).toBeInTheDocument()
    expect(container).toMatchSnapshot()
  })

  // What src/Auth0/reportAuthFailure.js and the Sentry setup rely on being
  // disclosed: monitoring is always on and the analytics choice is GA-only.
  it('discloses always-on error monitoring apart from optional analytics', () => {
    const {getByText} = render(<Privacy/>, {wrapper: HelmetThemeCtx})
    const monitoring = getByText(/Error and reliability monitoring/).closest('p').textContent
    expect(monitoring).toMatch(/always on/)
    expect(monitoring).toMatch(/your account identifier/)
    expect(monitoring).toMatch(/never include your email, name, sign-in tokens or the contents of your files/)
    expect(monitoring).toMatch(/keeps error reports for 90 days and page-timing data for 30 days/)
    const analytics = getByText(/Analytics \(optional\)/).closest('p').textContent
    expect(analytics).toMatch(/does not turn off the error monitoring/)
  })

  it('says the same about monitoring and analytics as the marketing copy', () => {
    const {getByText} = render(<Privacy/>, {wrapper: HelmetThemeCtx})
    const marketing = marketingPolicyText()
    for (const heading of [/Error and reliability monitoring/, /Analytics \(optional\)/]) {
      const paragraph = getByText(heading).closest('p').textContent.replace(/\s+/g, ' ').trim()
      expect(marketing).toContain(paragraph)
    }
  })
})
