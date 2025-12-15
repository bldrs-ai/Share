import React from 'react'
import {render, fireEvent, waitFor} from '@testing-library/react'
import {StoreRouteThemeCtx} from '../../Share.fixture'
import HelpControl, {testId} from './HelpControl'


describe('HelpControl', () => {
  it('shows onboarding overlay when help button is clicked', async () => {
    const {getByTestId} = render(<HelpControl/>, {wrapper: StoreRouteThemeCtx})
    const button = getByTestId(testId)
    fireEvent.click(button)

    // Should show onboarding overlay first, not help dialog immediately
    await waitFor(() => {
      expect(getByTestId('onboarding-overlay')).toBeInTheDocument()
    })
  })

  it('shows help dialog after onboarding overlay is closed', async () => {
    const {getByTestId, getByText} = render(<HelpControl/>, {wrapper: StoreRouteThemeCtx})
    const button = getByTestId(testId)

    // Click help button to show onboarding overlay
    fireEvent.click(button)

    await waitFor(() => {
      expect(getByTestId('onboarding-overlay')).toBeInTheDocument()
    })

    // Close the onboarding overlay by clicking it
    const overlay = getByTestId('onboarding-overlay')
    fireEvent.click(overlay)

    // Should then show help dialog
    await waitFor(() => {
      const text = getByText('Study the model using standard sections')
      expect(text).toBeInTheDocument()
    })
  })

  it('navigates to the next page when the next button is clicked', async () => {
    const {getByTestId, getByText} = render(<HelpControl/>, {wrapper: StoreRouteThemeCtx})
    const button = getByTestId(testId)

    // Click help button and go through onboarding flow
    fireEvent.click(button)

    await waitFor(() => {
      expect(getByTestId('onboarding-overlay')).toBeInTheDocument()
    })

    // Close the onboarding overlay
    const overlay = getByTestId('onboarding-overlay')
    fireEvent.click(overlay)

    // Wait for help dialog to appear
    await waitFor(() => {
      expect(getByText('Study the model using standard sections')).toBeInTheDocument()
    })

    // Click next button
    const nextPageButton = getByTestId('Next')
    fireEvent.click(nextPageButton)

    // Check second page content
    await waitFor(() => {
      const text = getByText('Isolate selected element')
      expect(text).toBeInTheDocument()
    })
  })
})
