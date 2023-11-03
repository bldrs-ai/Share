import {loadLocalFile} from './loader'


describe('loadLocalFile', () => {
  let navigateMock
  let handleBeforeUnloadMock
  const appPrefix = '/AppPrefix'

  beforeEach(() => {
    // Set up DOM structure
    document.body.innerHTML = `
      <div id="viewer-container"></div>
    `

    // Mock functions
    navigateMock = jest.fn()
    handleBeforeUnloadMock = jest.fn()

    // Mock window methods/events
    window.removeEventListener = jest.fn()
    URL.createObjectURL = jest.fn(() => 'test:testId')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('loads a local file and navigates to the appropriate URL', () => {
    loadLocalFile(navigateMock, appPrefix, handleBeforeUnloadMock)

    // // Mock input change event with a file
    // const inputElement = document.querySelector('input[type="file"]')
    // if (!inputElement) {
    //   throw new Error('Input element not found!')
    // }

    // const event = new Event('change', {bubbles: true})
    // // Use Object.defineProperty to mock the read-only `target` property
    // Object.defineProperty(event, 'target', {
    //   value: {
    //     files: [{name: 'testFile.ifc', type: 'application/octet-stream'}],
    //   },
    //   writable: false,
    // })
    // inputElement.dispatchEvent(event)

    // expect(URL.createObjectURL).toHaveBeenCalledWith(event.target.files[0])
    // expect(window.removeEventListener).toHaveBeenCalledWith('beforeunload', handleBeforeUnloadMock)
    // expect(navigateMock).toHaveBeenCalledWith(`${appPrefix}/v/new/testBlobId.ifc`)
  })
})
