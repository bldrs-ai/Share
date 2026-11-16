import {isPerfVisible, setPerfVisible} from '../utils/PerfMonitor'
import {
  installDebugPanelsShortcut,
  isLookPanelWanted,
  resetDebugPanelsForTest,
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
  let viewer
  let remove

  beforeEach(() => {
    resetDebugPanelsForTest()
    setPerfVisible(false)
    viewer = {setLookPanelVisible: jest.fn()}
    remove = installDebugPanelsShortcut(() => viewer)
  })

  afterEach(() => {
    remove()
    setPerfVisible(false)
    delete window.perf
  })

  it('backtick shows both panels, and again hides both', () => {
    press()
    expect(isPerfVisible()).toBe(true)
    expect(viewer.setLookPanelVisible).toHaveBeenLastCalledWith(true)
    expect(isLookPanelWanted()).toBe(true)
    press()
    expect(isPerfVisible()).toBe(false)
    expect(viewer.setLookPanelVisible).toHaveBeenLastCalledWith(false)
    expect(isLookPanelWanted()).toBe(false)
  })

  it('hides both when only one was up (?feature=perf started the overlay alone)', () => {
    setPerfVisible(true)
    expect(toggleDebugPanels(viewer)).toBe(false)
    expect(isPerfVisible()).toBe(false)
    expect(viewer.setLookPanelVisible).toHaveBeenLastCalledWith(false)
  })

  it('ignores typing in a field, modifiers and key repeat', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    press({}, input)
    press({ctrlKey: true})
    press({metaKey: true})
    press({repeat: true})
    expect(isPerfVisible()).toBe(false)
    expect(viewer.setLookPanelVisible).not.toHaveBeenCalled()
    input.remove()
  })

  it('still toggles the overlay before any viewer exists', () => {
    viewer = null
    press()
    expect(isPerfVisible()).toBe(true)
  })

  it('stops listening once removed', () => {
    remove()
    press()
    expect(isPerfVisible()).toBe(false)
    remove = () => {}
  })
})
