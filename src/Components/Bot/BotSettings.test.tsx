import React from 'react'
import {fireEvent, render, screen} from '@testing-library/react'
import BotSettings from './BotSettings'


describe('BotSettings', () => {
  it('renders the current API key value', () => {
    render(<BotSettings apiKey='existing-key' onApiKeyChange={jest.fn()} onClose={jest.fn()}/>)

    const input = screen.getByTestId('BotSettings-ApiKeyInput') as HTMLInputElement
    expect(input.value).toBe('existing-key')
  })

  // A key is optional now (#1932): clearing it and saving is how a user goes
  // back to the hosted assistant.
  it('saves an emptied key, so the user can go back to the hosted assistant', () => {
    const handleChange = jest.fn()
    render(<BotSettings apiKey='old-key' onApiKeyChange={handleChange} onClose={jest.fn()}/>)

    fireEvent.change(screen.getByTestId('BotSettings-ApiKeyInput'), {target: {value: '  '}})
    fireEvent.click(screen.getByTestId('BotSettings-OkButton'))

    expect(handleChange).toHaveBeenCalledWith('')
  })

  it('saves trimmed API key and closes settings', () => {
    const handleChange = jest.fn()
    const handleClose = jest.fn()
    render(<BotSettings apiKey='old' onApiKeyChange={handleChange} onClose={handleClose}/>)

    const input = screen.getByTestId('BotSettings-ApiKeyInput') as HTMLInputElement
    fireEvent.change(input, {target: {value: '   new-key   '}})
    fireEvent.click(screen.getByTestId('BotSettings-OkButton'))

    expect(handleChange).toHaveBeenCalledWith('new-key')
    expect(handleClose).toHaveBeenCalled()
  })
})

