import React from 'react'
import {fireEvent, render} from '@testing-library/react'
import * as Analytics from '../../privacy/analytics'
import PrivacyControl from './PrivacyControl'


describe('PrivacyControl', () => {
  test('toggle sets analytics cookie correctly', () => {
    expect(Analytics.isAllowed()).toBe(true)

    const {getByRole} = render(<PrivacyControl/>)
    const enableAnalyticsToggle = getByRole('checkbox')
    expect(enableAnalyticsToggle).toBeInTheDocument()

    fireEvent.click(enableAnalyticsToggle)
    expect(Analytics.isAllowed()).toBe(false)

    fireEvent.click(enableAnalyticsToggle)
    expect(Analytics.isAllowed()).toBe(true)
  })
})
