import React from 'react'
import {fireEvent, render, screen} from '@testing-library/react'
import BotSettings from './BotSettings'


describe('BotSettings', () => {
  it('renders the current API key value', () => {
    render(<BotSettings apiKey='existing-key' onApiKeyChange={jest.fn()} onClose={jest.fn()}/>)

    const input = screen.getByTestId('BotSettings-ApiKeyInput') as HTMLInputElement
    expect(input.value).toBe('existing-key')
  })

  it('disables save when key is empty', () => {
    render(<BotSettings apiKey='' onApiKeyChange={jest.fn()} onClose={jest.fn()}/>)

    expect(screen.getByTestId('BotSettings-OkButton')).toBeDisabled()
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

