import {ASSIST_FREE_MODELS, ASSIST_MODEL} from '../../viewer/tools/assistModels'
import {
  AI_CATALOGUE_URL,
  ASSIST_MODEL_CHOICE_KEY,
  DEFAULT_MODEL_CHOICE,
  assistModelChoice,
  hostedModelFor,
  isUserChosenModel,
  loadAssistCatalogue,
  resetAssistModelChoice,
} from './assistModelChoice'
import {assistAuth, assistHostedSide} from './assistState'


describe('assistModelChoice (#1934)', () => {
  beforeEach(() => {
    localStorage.clear()
    resetAssistModelChoice()
  })

  afterEach(() => {
    jest.restoreAllMocks()
    assistAuth.current = {isAuthenticated: false, getAccessTokenSilently: null, isPro: false}
  })

  it('is the default until a choice is made, then survives a reload', () => {
    expect(assistModelChoice.get()).toEqual(DEFAULT_MODEL_CHOICE)
    const seen = jest.fn()
    assistModelChoice.subscribe(seen)
    assistModelChoice.set({freeModels: true, model: 'x-ai/grok-4.7'})
    expect(seen).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem(ASSIST_MODEL_CHOICE_KEY))).toEqual({freeModels: true, model: 'x-ai/grok-4.7'})
    // A reload: the module's copy is gone, storage is not.
    resetAssistModelChoice()
    expect(assistModelChoice.get()).toEqual({freeModels: true, model: 'x-ai/grok-4.7'})
  })

  it.each([
    ['not JSON', '{nope'],
    ['a model that isn\'t an id', JSON.stringify({freeModels: false, model: 'https://evil.example/x'})],
    ['a truthy non-boolean switch', JSON.stringify({freeModels: 'yes', model: null})],
  ])('reads a stored choice that is %s as the default', (_name, raw) => {
    localStorage.setItem(ASSIST_MODEL_CHOICE_KEY, raw)
    const choice = assistModelChoice.get()
    expect(choice.freeModels).toBe(false)
    expect(choice.model).toBeNull()
  })

  it('works for the page when storage is blocked', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(assistModelChoice.get()).toEqual(DEFAULT_MODEL_CHOICE)
    assistModelChoice.set({freeModels: true, model: null})
    expect(assistModelChoice.get()).toEqual({freeModels: true, model: null})
  })

  it.each([
    [{freeModels: false, model: null}, false, ASSIST_MODEL],
    [{freeModels: false, model: null}, true, ASSIST_MODEL],
    [{freeModels: false, model: 'x-ai/grok-4.7'}, true, 'x-ai/grok-4.7'],
    // A pick is Pro's: on any other tier the default goes, and the relay
    // would refuse the pick anyway.
    [{freeModels: false, model: 'x-ai/grok-4.7'}, false, ASSIST_MODEL],
    // Free models win over a pick, on every tier.
    [{freeModels: true, model: 'x-ai/grok-4.7'}, true, ASSIST_FREE_MODELS],
    [{freeModels: true, model: null}, false, ASSIST_FREE_MODELS],
  ])('%j with Pro %s sends %s', (choice, isPro, expected) => {
    expect(hostedModelFor(choice, isPro)).toBe(expected)
  })

  it('the hosted transport reads the choice and the Pro state at each turn, and remembers what it sent', () => {
    assistModelChoice.set({freeModels: false, model: 'x-ai/grok-4.7'})
    expect(assistHostedSide.model()).toBe(ASSIST_MODEL)
    assistAuth.current = {...assistAuth.current, isPro: true}
    expect(assistHostedSide.model()).toBe('x-ai/grok-4.7')
    expect(isUserChosenModel(assistHostedSide.lastModel)).toBe(true)
    assistModelChoice.set({freeModels: false, model: null})
    expect(assistHostedSide.model()).toBe(ASSIST_MODEL)
    expect(isUserChosenModel(assistHostedSide.lastModel)).toBe(false)
  })

  describe('loadAssistCatalogue', () => {
    const CATALOGUE = {source: 'live', default: ASSIST_MODEL, free: ASSIST_FREE_MODELS, models: []}

    it('fetches the relay\'s list once per page', async () => {
      const fetchImpl = jest.fn(() => Promise.resolve(new Response(JSON.stringify(CATALOGUE), {status: 200})))
      expect(await loadAssistCatalogue(fetchImpl)).toEqual(CATALOGUE)
      expect(await loadAssistCatalogue(fetchImpl)).toEqual(CATALOGUE)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(fetchImpl.mock.calls[0][0]).toBe(`http://localhost${AI_CATALOGUE_URL}`)
    })

    it('answers null on a failure, and tries again next time', async () => {
      const fetchImpl = jest.fn()
        .mockImplementationOnce(() => Promise.resolve(new Response('', {status: 503})))
        .mockImplementationOnce(() => Promise.reject(new TypeError('offline')))
        .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify(CATALOGUE), {status: 200})))
      expect(await loadAssistCatalogue(fetchImpl)).toBeNull()
      expect(await loadAssistCatalogue(fetchImpl)).toBeNull()
      expect(await loadAssistCatalogue(fetchImpl)).toEqual(CATALOGUE)
    })
  })
})
