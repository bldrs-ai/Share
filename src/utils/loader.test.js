import {loadLocalFile, loadLocalFileFallback, saveDnDFileToOpfsFallback} from './loader'


describe('loadLocalFile', () => {
  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = `<div id="viewer-container"></div>`
    URL.createObjectURL = jest.fn(() => 'testId')
    URL.revokeObjectURL = jest.fn()
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
    expect(onLoad).toHaveBeenCalledWith('testId', expect.any(Number))
  })

  it('revokes the object URL when the worker is disabled (sync fallback path)', () => {
    // When testingDisableWebWorker=true the worker path is skipped
    // and onLoad fires synchronously; the revoke must happen by then
    // so the underlying blob isn't pinned in memory.
    const onLoad = jest.fn()
    loadLocalFile(onLoad, true, true)

    const inputElement = document.querySelector('input[type="file"]')
    Object.defineProperty(inputElement, 'files', {value: [new File(['dummy'], 'test.ifc')]})
    inputElement.dispatchEvent(new Event('change', {bubbles: true}))

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('testId')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
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


describe('loadLocalFileFallback', () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="viewer-container"></div>`
    URL.createObjectURL = jest.fn(() => 'testId')
    URL.revokeObjectURL = jest.fn()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('revokes the object URL after extracting the blob id', () => {
    const onLoad = jest.fn()
    loadLocalFileFallback(onLoad, true)

    const inputElement = document.querySelector('input[type="file"]')
    Object.defineProperty(inputElement, 'files', {value: [new File(['dummy'], 'test.ifc')]})
    inputElement.dispatchEvent(new Event('change', {bubbles: true}))

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('testId')
    expect(onLoad).toHaveBeenCalledWith('testId', expect.any(Number))
  })
})


describe('saveDnDFileToOpfsFallback', () => {
  beforeEach(() => {
    URL.createObjectURL = jest.fn(() => 'http://localhost/blob/abc123')
    URL.revokeObjectURL = jest.fn()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('revokes the object URL before invoking the callback', () => {
    let revokeCalledBeforeCallback = false
    const callback = jest.fn(() => {
      revokeCalledBeforeCallback = URL.revokeObjectURL.mock.calls.length > 0
    })
    saveDnDFileToOpfsFallback(new File(['dummy'], 'test.ifc'), callback)

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('http://localhost/blob/abc123')
    expect(callback).toHaveBeenCalledWith('abc123')
    expect(revokeCalledBeforeCallback).toBe(true)
  })
})
