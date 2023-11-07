import {loadLocalFile} from './loader'


describe('loadLocalFile', () => {
  let navigateMock
  let handleBeforeUnloadMock
  const appPrefix = '/appPrefix'

  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = `<div id="viewer-container"></div>`

    // Mock functions
    navigateMock = jest.fn()
    handleBeforeUnloadMock = jest.fn()

    // Mock window events
    window.removeEventListener = jest.fn()
    URL.createObjectURL = jest.fn(() => 'testId')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('loads a local file and navigates to the appropriate URL', () => {
    loadLocalFile(navigateMock, appPrefix, handleBeforeUnloadMock, true)

    // Mock input change event with a file
    const inputElement = document.querySelector('input[type="file"]')

    const event = new Event('change', {bubbles: true})
    inputElement.dispatchEvent(event)

    expect(URL.createObjectURL).toHaveBeenCalledWith(event.target.files[0])
    expect(window.removeEventListener).toHaveBeenCalledWith('beforeunload', handleBeforeUnloadMock)
    expect(navigateMock).toHaveBeenCalledWith(`${appPrefix}/v/new/testId.ifc`)
  })

  it('throws an error if viewer-container is missing', () => {
    document.body.innerHTML = ''
    expect(() => {
      loadLocalFile(navigateMock, appPrefix, handleBeforeUnloadMock, true)
    }).toThrow()
  })

  it('removes the file input after click if skipAutoRemove is false', () => {
    loadLocalFile(navigateMock, appPrefix, handleBeforeUnloadMock, false)
    const inputElement = document.querySelector('input[type="file"]')
    expect(inputElement).toBeNull()
  })
})
