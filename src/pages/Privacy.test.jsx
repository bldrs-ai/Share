import fs from 'fs'
import path from 'path'
import React from 'react'
import {render} from '@testing-library/react'
import {HelmetThemeCtx} from '../Share.fixture'
import Privacy from './Privacy'


// The policy has two copies: this page (the SPA's /privacy route, BaseRoutes.jsx)
// and the marketing site's (/privacy/, which wins on bldrs.ai and is the one
// search and the About dialog's link reach).
const MARKETING_POLICY = path.join(__dirname, '../../marketing/src/app/privacy/page.tsx')


/**
 * The marketing source reduced to the text it renders: JSX comments and
 * tags dropped, whitespace collapsed.
 *
 * @return {string}
 */
function marketingPolicyText() {
  return fs.readFileSync(MARKETING_POLICY, 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
}


/**
 * @param {Function} getByText from render
 * @param {string} heading the paragraph's bold lead
 * @return {string} the paragraph's text, whitespace collapsed
 */
function paragraph(getByText, heading) {
  return getByText(heading, {selector: 'strong'}).closest('p').textContent.replace(/\s+/g, ' ').trim()
}


describe('Privacy', () => {
  it('renders', () => {
    const {container, getByText} = render(<Privacy/>, {wrapper: HelmetThemeCtx})
    const title = getByText('Privacy Policy')
    expect(title).toBeInTheDocument()
    expect(container).toMatchSnapshot()
  })

  // design/new/analytics-consent.md: no Google Analytics in the browser, and
  // what is measured instead, said plainly.
  it('says there is no in-app tracking, and what each always-on report carries', () => {
    const {getByText} = render(<Privacy/>, {wrapper: HelmetThemeCtx})
    const loads = paragraph(getByText, 'How models load.')
    expect(loads).toMatch(/There is no Google Analytics or other tracking code in the app/)
    expect(loads).toMatch(/never includes a model’s name, path, web address or contents/)
    expect(loads).toMatch(/the only model it names is one of our own sample models/)
    expect(loads).toMatch(/lives only while the page is open/)
    const limits = paragraph(getByText, 'Free-use limits.')
    expect(limits).toMatch(/used only to apply the free allowance/)
    // What the limit records actually keep (record-load.js stores the model's
    // key and time), and that error reports can carry the page address.
    expect(limits).toMatch(/which model, and when/)
    const errors = paragraph(getByText, 'Error and reliability reports.')
    expect(errors).toMatch(/that page address includes where the model is/)
  })

  it('says the same about telemetry as the marketing copy', () => {
    const {getByText} = render(<Privacy/>, {wrapper: HelmetThemeCtx})
    const marketing = marketingPolicyText()
    for (const heading of ['Error and reliability reports.', 'How models load.', 'Free-use limits.']) {
      expect(marketing).toContain(paragraph(getByText, heading))
    }
  })
})
