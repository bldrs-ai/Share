import React from 'react'
import {act, fireEvent, render, screen, within} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import PkgJson from '../../../package.json'
import LogoMenu from './LogoMenu'


describe('LogoMenu', () => {
  it('opens the popup with the tagline and marketing links', () => {
    render(<ShareMock><LogoMenu/></ShareMock>)

    fireEvent.click(screen.getByTestId('workspace-logo-button'))

    // Scoped to the menu: the About dialog this component also renders
    // is open for first-time visitors and repeats the tagline.
    const menu = within(screen.getByTestId('workspace-logo-menu'))
    expect(menu.getByText('Build Every Thing Together')).toBeInTheDocument()
    expect(menu.getByText('Fastest browser-based CAD')).toBeInTheDocument()

    const expectedLinks = [
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

  // Inherited from the AboutControl this replaces while the flag is on.
  it('carries the version in the logo tooltip', async () => {
    // Help-tooltips mode pins tooltips open, so this doesn't race the
    // hover enterDelay.
    act(() => {
      useStore.setState({isHelpTooltipsVisible: true})
    })
    render(<ShareMock><LogoMenu/></ShareMock>)

    expect(await screen.findByText(`Bldrs ${PkgJson.version}`)).toBeInTheDocument()

    act(() => {
      useStore.setState({isHelpTooltipsVisible: false})
    })
  })

  it('About opens the in-app dialog', () => {
    render(<ShareMock><LogoMenu/></ShareMock>)

    fireEvent.click(screen.getByTestId('workspace-logo-button'))
    fireEvent.click(screen.getByTestId('workspace-logo-menu-about'))

    expect(useStore.getState().isAboutVisible).toBe(true)
  })
})
