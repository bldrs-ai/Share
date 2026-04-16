import {setKeydownListeners} from './shortcutKeys'


describe('utils/shortcutKeys', () => {
  let viewer
  let selectItemsInScene
  let canvas

  beforeEach(() => {
    viewer = {
      clipper: {
        createPlane: jest.fn(),
        deletePlane: jest.fn(),
      },
      isolator: {
        hideSelectedElements: jest.fn(),
        unHideAllElements: jest.fn(),
        toggleIsolationMode: jest.fn(),
        toggleRevealHiddenElements: jest.fn(),
      },
    }
    selectItemsInScene = jest.fn()

    canvas = document.createElement('canvas')
    document.body.appendChild(canvas)

    setKeydownListeners(viewer, selectItemsInScene)
  })

  afterEach(() => {
    window.onkeydown = null
    canvas.remove()
  })


  /**
   * Dispatch a keydown event originating from the canvas.
   *
   * @param {string} code KeyboardEvent.code value, e.g. 'KeyQ'
   */
  function dispatchKey(code) {
    const event = new KeyboardEvent('keydown', {code, bubbles: true})
    canvas.dispatchEvent(event)
  }


  it('ignores key events whose target is not a CANVAS', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    const event = new KeyboardEvent('keydown', {code: 'KeyQ', bubbles: true})
    input.dispatchEvent(event)
    input.remove()

    expect(viewer.clipper.createPlane).not.toHaveBeenCalled()
  })

  it('ignores key events with no target', () => {
    window.onkeydown({code: 'KeyQ'})
    expect(viewer.clipper.createPlane).not.toHaveBeenCalled()
  })

  it('KeyQ creates a clip plane', () => {
    dispatchKey('KeyQ')
    expect(viewer.clipper.createPlane).toHaveBeenCalledTimes(1)
  })

  it('KeyW deletes a clip plane', () => {
    dispatchKey('KeyW')
    expect(viewer.clipper.deletePlane).toHaveBeenCalledTimes(1)
  })

  it('KeyA clears the selection', () => {
    dispatchKey('KeyA')
    expect(selectItemsInScene).toHaveBeenCalledWith([])
  })

  it('Escape clears the selection', () => {
    dispatchKey('Escape')
    expect(selectItemsInScene).toHaveBeenCalledWith([])
  })

  it('KeyH hides the selected elements', () => {
    dispatchKey('KeyH')
    expect(viewer.isolator.hideSelectedElements).toHaveBeenCalledTimes(1)
  })

  it('KeyU unhides all elements', () => {
    dispatchKey('KeyU')
    expect(viewer.isolator.unHideAllElements).toHaveBeenCalledTimes(1)
  })

  it('KeyI toggles isolation mode', () => {
    dispatchKey('KeyI')
    expect(viewer.isolator.toggleIsolationMode).toHaveBeenCalledTimes(1)
  })

  it('KeyR toggles reveal of hidden elements', () => {
    dispatchKey('KeyR')
    expect(viewer.isolator.toggleRevealHiddenElements).toHaveBeenCalledTimes(1)
  })

  it('is a no-op for unrelated keys', () => {
    dispatchKey('KeyZ')
    expect(viewer.clipper.createPlane).not.toHaveBeenCalled()
    expect(viewer.clipper.deletePlane).not.toHaveBeenCalled()
    expect(viewer.isolator.hideSelectedElements).not.toHaveBeenCalled()
    expect(selectItemsInScene).not.toHaveBeenCalled()
  })
})
