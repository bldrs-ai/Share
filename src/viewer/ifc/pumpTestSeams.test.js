import {PREVIEW_FINISH_PARSE} from '@bldrs-ai/conway/src/compat/web-ifc/streamed_preview_channel'
import {enableStepPreviewFinishParse, testPumpBatchSize, testStepPreviewFinishParse} from './pumpTestSeams'


describe('viewer/ifc/pumpTestSeams', () => {
  const wasEnabled = PREVIEW_FINISH_PARSE.enabled

  afterEach(() => {
    delete globalThis.__bldrsTestPumpBatchSize
    delete globalThis.__bldrsTestStepPreviewFinishParse
    PREVIEW_FINISH_PARSE.enabled = wasEnabled
  })

  it('reads a positive integer pump batch size, and nothing else', () => {
    expect(testPumpBatchSize()).toBeUndefined()
    globalThis.__bldrsTestPumpBatchSize = 3
    expect(testPumpBatchSize()).toBe(3)
    globalThis.__bldrsTestPumpBatchSize = 0
    expect(testPumpBatchSize()).toBeUndefined()
  })

  it('asks for conway\'s parked parse-end preview tick only when the page set the seam to true', () => {
    expect(testStepPreviewFinishParse()).toBe(false)
    globalThis.__bldrsTestStepPreviewFinishParse = 'yes'
    expect(testStepPreviewFinishParse()).toBe(false)
    globalThis.__bldrsTestStepPreviewFinishParse = true
    expect(testStepPreviewFinishParse()).toBe(true)
  })

  it('turns the tick on in this bundle\'s conway, which parks it off by default (conway#773)', () => {
    expect(PREVIEW_FINISH_PARSE.enabled).toBe(false)
    enableStepPreviewFinishParse()
    expect(PREVIEW_FINISH_PARSE.enabled).toBe(true)
  })
})
