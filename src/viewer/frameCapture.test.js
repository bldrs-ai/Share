import {
  CAPTURE_FAILURES,
  CAPTURE_JPEG_QUALITIES,
  captureSize,
  captureViewerFrame,
  encodeJpeg,
} from './frameCapture'


/* eslint-disable no-magic-numbers */
/**
 * A viewer whose render demand paints only when `paint()` is called, as an
 * on-demand session does, and tells its paint observers in that call.
 *
 * @return {object} `{viewer, demand, paint, observers, canvas}`
 */
function fakeViewer() {
  const observers = new Set()
  const canvas = {width: 2560, height: 1600}
  const demand = {
    observePaints: (observer) => {
      observers.add(observer)
      return () => observers.delete(observer)
    },
    invalidate: jest.fn(),
  }
  const paint = () => {
    for (const observer of [...observers]) {
      observer.afterPaint?.(1, 'full')
    }
  }
  const viewer = {context: {getRenderDemand: () => demand, getRenderer: () => ({domElement: canvas})}}
  return {viewer, demand, paint, observers, canvas}
}


describe('viewer/frameCapture', () => {
  it('scales the long side down to 1280, never up', () => {
    expect(captureSize(2560, 1600)).toEqual({width: 1280, height: 800})
    expect(captureSize(1200, 2400)).toEqual({width: 640, height: 1280})
    expect(captureSize(800, 600)).toEqual({width: 800, height: 600})
  })

  it('asks for a paint and copies the canvas inside that paint\'s task, then encodes the copy', async () => {
    const {viewer, demand, paint, observers, canvas} = fakeViewer()
    const copy = jest.fn(() => 'copied')
    const encode = jest.fn(() => 'data:image/jpeg;base64,AAAA')
    const shot = captureViewerFrame(viewer, {maxChars: 100, copy, encode})
    expect(demand.invalidate).toHaveBeenCalledTimes(1)
    expect(copy).not.toHaveBeenCalled()
    paint()
    // Within the paint's own call: after it, the buffer would be cleared.
    expect(copy).toHaveBeenCalledWith(canvas)
    expect(encode).not.toHaveBeenCalled()
    expect(observers.size).toBe(0)
    await expect(shot).resolves.toBe('data:image/jpeg;base64,AAAA')
    expect(encode).toHaveBeenCalledWith('copied', 100)
  })

  it('fails as no_viewer without a viewer, and as timeout when no paint comes', async () => {
    await expect(captureViewerFrame(null, {maxChars: 100})).rejects.toMatchObject({reason: CAPTURE_FAILURES.NO_VIEWER})
    const {viewer, observers} = fakeViewer()
    await expect(captureViewerFrame(viewer, {maxChars: 100, timeoutMs: 5})).rejects
      .toMatchObject({reason: CAPTURE_FAILURES.TIMEOUT})
    expect(observers.size).toBe(0)
  })

  it('fails as encode when the copy throws, and passes an encoder\'s own reason on', async () => {
    let fake = fakeViewer()
    let shot = captureViewerFrame(fake.viewer, {maxChars: 100, copy: () => {
      throw new Error('no 2d')
    }})
    fake.paint()
    await expect(shot).rejects.toMatchObject({reason: CAPTURE_FAILURES.ENCODE})
    fake = fakeViewer()
    shot = captureViewerFrame(fake.viewer, {maxChars: 100, copy: () => 'c', encode: () => {
      throw Object.assign(new Error('big'), {reason: CAPTURE_FAILURES.TOO_LARGE})
    }})
    fake.paint()
    await expect(shot).rejects.toMatchObject({reason: CAPTURE_FAILURES.TOO_LARGE})
  })

  describe('encodeJpeg', () => {
    // A canvas whose JPEG shrinks with quality: 100 characters per tenth.
    const canvas = {toDataURL: jest.fn((type, quality) =>
      `data:image/jpeg;base64,${'A'.repeat(Math.round(quality * 1000))}`)}

    it('takes the best quality that fits', () => {
      expect(encodeJpeg(canvas, 10000).length).toBe(23 + 800)
      expect(encodeJpeg(canvas, 700).length).toBe(23 + 600)
      expect(canvas.toDataURL).toHaveBeenLastCalledWith('image/jpeg', CAPTURE_JPEG_QUALITIES[1])
    })

    it('fails as too_large when no quality fits, and refuses a browser that answers PNG', () => {
      expect(() => encodeJpeg(canvas, 100)).toThrow(expect.objectContaining({reason: CAPTURE_FAILURES.TOO_LARGE}))
      expect(() => encodeJpeg({toDataURL: () => 'data:image/png;base64,AAAA'}, 1000)).toThrow('jpeg not supported')
    })
  })
})
