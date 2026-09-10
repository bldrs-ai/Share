import {triggerDownload} from './download'


describe('triggerDownload', () => {
  const BLOB_URL = 'blob:http://localhost/export'
  let clicked

  beforeEach(() => {
    jest.useFakeTimers()
    clicked = null
    URL.createObjectURL = jest.fn().mockReturnValue(BLOB_URL)
    URL.revokeObjectURL = jest.fn()
    // Capture the anchor at click time: the real one removes itself
    // immediately afterwards, so a post-hoc DOM query would find nothing.
    const createElement = document.createElement.bind(document)
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      const element = createElement(tag)
      if (tag === 'a') {
        jest.spyOn(element, 'click').mockImplementation(() => {
          clicked = {
            href: element.href,
            download: element.download,
            isInDocument: document.body.contains(element),
          }
        })
      }
      return element
    })
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('clicks an in-document anchor carrying the filename', () => {
    triggerDownload(new Blob(['x']), 'box.glb')

    expect(clicked).toEqual({href: BLOB_URL, download: 'box.glb', isInDocument: true})
    // Firefox only dispatches the download for an anchor that is in the
    // document, and the anchor must not be left behind.
    expect(document.querySelectorAll('a').length).toBe(0)
  })

  it('revokes the object URL, but not in the same tick as the click', () => {
    triggerDownload(new Blob(['x']), 'box.glb')

    // Revoking inline can cancel the download in Chromium.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    jest.runAllTimers()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(BLOB_URL)
  })
})
