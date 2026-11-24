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
  // disclosed: error reports are always on, carry the account ID and (only
  // with consent) the GA ID, and usage metrics wait for OK
  // (design/new/analytics-consent.md).
  it('discloses always-on error reports apart from consented usage metrics', () => {
    const {getByText} = render(<Privacy/>, {wrapper: HelmetThemeCtx})
    const reports = getByText('Error and reliability reports.', {selector: 'strong'}).closest('p').textContent
    expect(reports).toMatch(/always on/)
    expect(reports).toMatch(/your account ID/)
    expect(reports).toMatch(/Auth0 tracking ID/)
    expect(reports).toMatch(/set cookies or include your email, name, sign-in tokens/)
    expect(reports).toMatch(/Unless you allow usage metrics, they carry no identifier/)
    expect(reports).toMatch(/keeps error reports for 90 days and page-timing data for 30 days/)
    const usage = getByText('Usage metrics.', {selector: 'strong'}).closest('p').textContent
    expect(usage).toMatch(/Nothing is collected for usage metrics until you press OK/)
  })

  it('says the same about error reports and usage metrics as the marketing copy', () => {
    const {getByText} = render(<Privacy/>, {wrapper: HelmetThemeCtx})
    const marketing = marketingPolicyText()
    for (const heading of ['Error and reliability reports.', 'Usage metrics.']) {
      const paragraph = getByText(heading, {selector: 'strong'}).closest('p').textContent.replace(/\s+/g, ' ').trim()
      expect(marketing).toContain(paragraph)
    }
  })
})
