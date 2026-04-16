// Characterization tests for LoadModelEventHandler. See
// HideElementsEventHandler.test.js for scope.

import AbstractApiConnection from '../ApiConnection'
import LoadModelEventHandler from './LoadModelEventHandler'


describe('WidgetApi/event-handlers/LoadModelEventHandler', () => {
  let apiConnection
  let navigation

  beforeEach(() => {
    apiConnection = new AbstractApiConnection()
    navigation = jest.fn()
  })


  it('exposes the canonical event name', () => {
    const handler = new LoadModelEventHandler(apiConnection, navigation)
    expect(handler.name).toBe('ai.bldrs-share.LoadModel')
  })


  it('returns missing-argument when githubIfcPath is absent', () => {
    const handler = new LoadModelEventHandler(apiConnection, navigation)
    const result = handler.handler({})
    expect(result).toEqual({error: true, reason: 'Missing argument githubIfcPath'})
    expect(navigation).not.toHaveBeenCalled()
  })


  it('prefixes /share/v/gh/ and hands the path to the navigation function', () => {
    const handler = new LoadModelEventHandler(apiConnection, navigation)
    const result = handler.handler({githubIfcPath: 'bldrs-ai/Share/main/sample.ifc'})

    expect(result).toEqual({error: false})
    expect(navigation).toHaveBeenCalledWith('/share/v/gh/bldrs-ai/Share/main/sample.ifc')
  })


  // TODO: LoadModelEventHandler does no validation of the githubIfcPath
  // string beyond presence — any value (including '' or '/../malicious')
  // will be concatenated verbatim into the route. Refactor target: add a
  // shape check (org/repo/branch/filepath) or delegate to the route parser.
  it('accepts an empty string path and still navigates', () => {
    const handler = new LoadModelEventHandler(apiConnection, navigation)
    handler.handler({githubIfcPath: ''})
    expect(navigation).toHaveBeenCalledWith('/share/v/gh/')
  })
})
