import {PRIVATE_ROUTE, setFeedbackStore as setStore} from './feedback.fixture'
import {feedbackView} from './feedbackView'


/* eslint-disable no-magic-numbers */
describe('feedback/feedbackView', () => {
  it('snapshots a hosted sample by ref, with the camera and the selection\'s refs and types', () => {
    setStore({})
    const {view, isPublic, names} = feedbackView()
    expect(isPublic).toBe(true)
    expect(names).toEqual([])
    expect(view).toEqual({
      model: {route_kind: 'project', source: 'hosted', format: 'ifc', ref: 'https://bldrs.ai/index.ifc'},
      camera: {position: [10.1235, 5, -3], target: [0, 0, 0]},
      selection: {count: 2, refs: ['e12', 'e13'], types: {IFCWALL: 2}},
    })
  })

  it('withholds any other model\'s ref, and names what to withhold from the text', () => {
    setStore({modelPath: PRIVATE_ROUTE})
    const {view, isPublic, names} = feedbackView()
    expect(isPublic).toBe(false)
    expect(view.model).toEqual({route_kind: 'github', source: 'hosted', format: 'ifc', ref: null})
    expect(names).toEqual(expect.arrayContaining(['Tower B.ifc', 'Acme HQ']))
    expect(JSON.stringify(view)).not.toMatch(/Tower|acme|secret/i)
  })

  it('has no camera when the viewer has none, and no model when none is loaded', () => {
    setStore({cameraControls: null, modelPath: null, model: null, rootElement: null, selectedAnchorIds: []})
    const {view} = feedbackView()
    expect(view).toEqual({model: {route_kind: null, source: null, format: null, ref: null}, camera: null,
      selection: {count: 0, refs: [], types: {}}})
  })
})
