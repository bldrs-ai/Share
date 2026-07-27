import React from 'react'
import {fireEvent, render, screen} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import LogoMenu from './LogoMenu'


describe('LogoMenu', () => {
  it('opens the marketing popup with About/Pricing/News links + tagline', () => {
    render(<ShareMock><LogoMenu/></ShareMock>)

    fireEvent.click(screen.getByTestId('workspace-logo-button'))

    expect(screen.getByText('Build Every Thing Together')).toBeInTheDocument()
    expect(screen.getByText('Fastest browser-based CAD')).toBeInTheDocument()

    const expectedLinks = [
      ['workspace-logo-menu-about', 'https://bldrs.ai/about'],
      ['workspace-logo-menu-pricing', 'https://bldrs.ai/pricing'],
      ['workspace-logo-menu-news', 'https://bldrs.ai/blog'],
    ]
    for (const [testId, href] of expectedLinks) {
      const link = screen.getByTestId(testId)
      expect(link).toHaveAttribute('href', href)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })
})
