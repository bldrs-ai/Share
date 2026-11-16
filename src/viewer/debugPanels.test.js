import {isPerfVisible, setPerfVisible} from '../utils/PerfMonitor'
import {
  installDebugPanelsShortcut,
  isRenderPanelShown,
  resetDebugPanelsForTest,
  setRenderPanelShown,
  subscribeRenderPanel,
  toggleDebugPanels,
} from './debugPanels'


/**
 * @param {object} [init] KeyboardEvent init
 * @param {EventTarget} [target]
 */
function press(init = {}, target = window) {
  target.dispatchEvent(new KeyboardEvent('keydown', {key: '`', bubbles: true, ...init}))
}


describe('viewer/debugPanels', () => {
  let remove

  beforeEach(() => {
    resetDebugPanelsForTest()
    setPerfVisible(false)
    remove = installDebugPanelsShortcut()
  })

  afterEach(() => {
    remove()
    setPerfVisible(false)
    setRenderPanelShown(false)
    delete window.perf
  })

  it('backtick shows both panels, and again hides both', () => {
    press()
    expect(isPerfVisible()).toBe(true)
    expect(isRenderPanelShown()).toBe(true)
    press()
    expect(isPerfVisible()).toBe(false)
    expect(isRenderPanelShown()).toBe(false)
  })

  it('hides both when only one was up (Display > Render... opened Render alone)', () => {
    setRenderPanelShown(true)
    expect(toggleDebugPanels()).toBe(false)
    expect(isPerfVisible()).toBe(false)
    expect(isRenderPanelShown()).toBe(false)
  })

  it('tells subscribers when the Render panel is shown or hidden, once per change', () => {
    const listener = jest.fn()
    const unsubscribe = subscribeRenderPanel(listener)
    setRenderPanelShown(true)
    setRenderPanelShown(true)
    setRenderPanelShown(false)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('ignores typing in a field, modifiers and key repeat', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    press({}, input)
    press({ctrlKey: true})
    press({metaKey: true})
    press({repeat: true})
    expect(isPerfVisible()).toBe(false)
    expect(isRenderPanelShown()).toBe(false)
    input.remove()
  })

  it('stops listening once removed', () => {
    remove()
    press()
    expect(isPerfVisible()).toBe(false)
    remove = () => {}
  })
})
