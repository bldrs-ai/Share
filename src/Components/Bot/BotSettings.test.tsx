import React from 'react'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import BotSettings, {FREE_MODELS_DISCLOSURE, priceLabel} from './BotSettings'


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


// #1934: which model the hosted assistant answers with.
describe('BotSettings model choice', () => {
  const CATALOGUE = {
    source: 'live',
    default: 'qwen/qwen3.7-flash',
    free: 'bldrs/free',
    models: [
      {id: 'qwen/qwen3.7-flash', name: 'Qwen: Qwen3.7 Flash', price: {input: 0.2, output: 0.8},
        tiers: ['anonymous', 'free', 'pro']},
      {id: 'anthropic/claude-haiku-4.5', name: 'Anthropic: Claude Haiku 4.5', price: {input: 1, output: 5}, tiers: ['pro']},
      {id: 'x-ai/grok-4.7', name: 'SpaceXSI: Grok 4.7', price: {input: 4, output: 12}, tiers: ['pro']},
    ],
  }

  /**
   * @param props BotSettings props past the key's
   * @return the save callback
   */
  function renderSettings(props: object = {}) {
    const onModelChoiceChange = jest.fn()
    const element = (
      <BotSettings
        apiKey=''
        onApiKeyChange={jest.fn()}
        onClose={jest.fn()}
        onModelChoiceChange={onModelChoiceChange}
        {...props}
      />
    )
    render(element)
    return onModelChoiceChange
  }

  it('a signed-out or free user gets the free-models switch, its disclosure, and a Pro hint, and no menu', () => {
    const loadCatalogue = jest.fn(() => Promise.resolve(CATALOGUE))
    const save = renderSettings({loadCatalogue})
    expect(screen.getByTestId('BotSettings-ProHint')).toHaveTextContent('Pro adds a choice of models.')
    expect(screen.queryByLabelText('Model')).toBeNull()
    expect(loadCatalogue).not.toHaveBeenCalled()
    const toggle = screen.getByRole('checkbox', {name: 'Free models (experimental)'})
    expect(toggle).toHaveAccessibleDescription(FREE_MODELS_DISCLOSURE)
    expect(FREE_MODELS_DISCLOSURE).toMatch(/rate-limited/)
    expect(FREE_MODELS_DISCLOSURE).toMatch(/may log or train on prompts/)
    fireEvent.click(toggle)
    fireEvent.click(screen.getByTestId('BotSettings-OkButton'))
    expect(save).toHaveBeenCalledWith({freeModels: true, model: null})
  })

  it('shows the saved choice, and turning free models off saves that', () => {
    const save = renderSettings({modelChoice: {freeModels: true, model: null}})
    const toggle = screen.getByRole('checkbox', {name: 'Free models (experimental)'}) as HTMLInputElement
    expect(toggle.checked).toBe(true)
    fireEvent.click(toggle)
    fireEvent.click(screen.getByTestId('BotSettings-OkButton'))
    expect(save).toHaveBeenCalledWith({freeModels: false, model: null})
  })

  it('Pro gets a menu of the relay\'s models with their prices, and saves the one picked', async () => {
    const save = renderSettings({isPro: true, loadCatalogue: () => Promise.resolve(CATALOGUE)})
    fireEvent.mouseDown(await screen.findByRole('combobox', {name: 'Model'}))
    const options = await screen.findAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      'Default: Qwen3.7 FlashBldrs\' pick, with two fallbacks',
      'Anthropic: Claude Haiku 4.5$1.00 / $5.00 per M tokens',
      'SpaceXSI: Grok 4.7$4.00 / $12.00 per M tokens',
    ])
    fireEvent.click(screen.getByRole('option', {name: /SpaceXSI: Grok 4.7/}))
    await waitFor(() => expect(screen.getByRole('combobox', {name: 'Model'})).toHaveTextContent('SpaceXSI: Grok 4.7'))
    expect(screen.getByTestId('BotSettings-ModelNote')).toHaveTextContent(/Only models that can answer without/)
    fireEvent.click(screen.getByTestId('BotSettings-OkButton'))
    expect(save).toHaveBeenCalledWith({freeModels: false, model: 'x-ai/grok-4.7'})
  })

  it('Pro\'s menu waits while free models are on, and says so', async () => {
    renderSettings({isPro: true, modelChoice: {freeModels: true, model: 'x-ai/grok-4.7'},
      loadCatalogue: () => Promise.resolve(CATALOGUE)})
    const menu = await screen.findByRole('combobox', {name: 'Model'})
    expect(menu).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText(/this choice waits until you turn them off/)).toBeInTheDocument()
  })

  it('says when only the curated models could be listed', async () => {
    renderSettings({isPro: true, loadCatalogue: () => Promise.resolve({...CATALOGUE, source: 'static'})})
    expect(await screen.findByText(/Couldn't load the full model list/)).toBeInTheDocument()
  })

  it('with a key of the user\'s own, the model settings are replaced by a note, and the choice is kept', () => {
    const loadCatalogue = jest.fn(() => Promise.resolve(CATALOGUE))
    const save = renderSettings({apiKey: 'sk-or-own', isPro: true, loadCatalogue,
      modelChoice: {freeModels: false, model: 'x-ai/grok-4.7'}})
    expect(screen.getByTestId('BotSettings-ModelByokNote')).toHaveTextContent('With your own key')
    expect(screen.queryByRole('checkbox', {name: 'Free models (experimental)'})).toBeNull()
    expect(screen.queryByRole('combobox', {name: 'Model'})).toBeNull()
    expect(loadCatalogue).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('BotSettings-OkButton'))
    expect(save).toHaveBeenCalledWith({freeModels: false, model: 'x-ai/grok-4.7'})
  })

  it('prints prices with cents from a dollar, two significant digits below', () => {
    expect(priceLabel({input: 0.09, output: 0.175})).toBe('$0.09 / $0.18 per M tokens')
    expect(priceLabel({input: 1.35, output: 6.75})).toBe('$1.35 / $6.75 per M tokens')
  })
})
