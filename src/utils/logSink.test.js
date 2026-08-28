import {createLogChannel} from './logSink'


// Each test builds its own channel under a throwaway globalThis key so it
// can't collide with the `[glb]` / `[conwayDirect]` channels the jest setup
// has already installed capturing sinks on.
describe('utils/logSink', () => {
  let sinkKey
  let infoSpy
  let channelCount = 0

  beforeEach(() => {
    channelCount += 1
    sinkKey = `__testLogSink_${channelCount}`
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    infoSpy.mockRestore()
    delete globalThis[sinkKey]
  })

  it('writes to the console under its prefix when no sink is installed', () => {
    const {emit} = createLogChannel('[test]', sinkKey)
    emit('info', ['parsed modelID=0', 7])
    // The prefix is its own console arg, so a browser's msg.text() joins it
    // back into `[test] parsed modelID=0 7` — the form E2E specs grep for.
    const SEVEN = 7
    expect(infoSpy).toHaveBeenCalledWith('[test]', 'parsed modelID=0', SEVEN)
  })

  it('routes to an installed sink instead of the console', () => {
    const {emit, setSink} = createLogChannel('[test]', sinkKey)
    const sink = jest.fn()
    setSink(sink)
    emit('warn', ['careful'])
    expect(sink).toHaveBeenCalledWith('warn', ['careful'])
    expect(infoSpy).not.toHaveBeenCalled()
  })

  it('restores the console sink when the sink is cleared', () => {
    const {emit, setSink} = createLogChannel('[test]', sinkKey)
    setSink(jest.fn())
    setSink(null)
    emit('info', ['back on the console'])
    expect(infoSpy).toHaveBeenCalledWith('[test]', 'back on the console')
  })

  it('shares the sink across re-imports of the channel module', () => {
    // The reason the sink lives on globalThis: a spec that calls
    // jest.resetModules() re-runs the channel module, and the freshly created
    // channel must still see the sink the test setup installed.
    const sink = jest.fn()
    createLogChannel('[test]', sinkKey).setSink(sink)
    createLogChannel('[test]', sinkKey).emit('info', ['second import'])
    expect(sink).toHaveBeenCalledWith('info', ['second import'])
    expect(infoSpy).not.toHaveBeenCalled()
  })
})
