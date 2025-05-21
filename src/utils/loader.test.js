import {loadLocalFile} from './loader'


describe('loadLocalFile', () => {
  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = `<div id="viewer-container"></div>`
    URL.createObjectURL = jest.fn(() => 'testId')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('loads a local file and navigates to the appropriate URL', () => {
    const onLoad = jest.fn()
    loadLocalFile(onLoad, true, true)

    // Mock input change event with a file
    const inputElement = document.querySelector('input[type="file"]')
    const file = new File(['dummy'], 'test.ifc')
    Object.defineProperty(inputElement, 'files', {value: [file]})

    const event = new Event('change', {bubbles: true})
    inputElement.dispatchEvent(event)

    expect(URL.createObjectURL).toHaveBeenCalledWith(file)
    expect(onLoad).toHaveBeenCalled()
  })

  it('throws an error if viewer-container is missing', () => {
    document.body.innerHTML = ''
    expect(() => {
      loadLocalFile(jest.fn(), true, true)
    }).toThrow()
  })

  it('removes the file input after click if skipAutoRemove is false', () => {
    loadLocalFile(jest.fn(), false, true)
    const inputElement = document.querySelector('input[type="file"]')
    expect(inputElement).toBeNull()
  })
})
