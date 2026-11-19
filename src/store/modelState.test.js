import fs from 'fs'
import path from 'path'
import {browserModelState} from './BrowserSlice'
import {ifcModelState} from './IFCSlice'
import {modelStateDefaults, resetModelState} from './modelState'
import useStore from './useStore'


describe('store/modelState', () => {
  it('declares only fields the store has, starting where they reset to', () => {
    const initial = useStore.getState()
    for (const [key, value] of Object.entries(modelStateDefaults())) {
      expect(Object.prototype.hasOwnProperty.call(initial, key)).toBe(true)
      if (key === 'opfsFile') {
        // BrowserSlice starts the test audiences on a mock File on purpose.
        continue
      }
      expect([key, initial[key]]).toEqual([key, value])
    }
  })

  // The fields step A's `CadView#forgetLoadedModelState` cleared (open-205
  // #2011), now declared by their slices: none may drop out of the reset.
  it('covers every field the switch cleared before sessions', () => {
    expect(Object.keys(modelStateDefaults())).toEqual(expect.arrayContaining([
      'isModelReady', 'model', 'rootElement', 'elementTypesMap', 'loadedFileInfo', 'glbArtifact',
      'opfsFile', 'loadReportLines', 'currentLoadLine', 'loadResult', 'expandedElements',
      'expandedTypes', 'defaultExpandedElements', 'defaultExpandedTypes', 'indexedModel',
      'isFirstMeshShown',
    ]))
  })

  it('resets the model\'s state and clears the search index', () => {
    const clearIndex = jest.spyOn(useStore.getState().searchIndex, 'clearIndex')
    useStore.setState({model: {}, rootElement: {}, expandedElements: ['1'], opfsFile: {}, glbArtifact: {}})
    resetModelState()
    const state = useStore.getState()
    expect(state.model).toBeNull()
    expect(state.rootElement).toBeNull()
    expect(state.expandedElements).toEqual([])
    expect(state.opfsFile).toBeNull()
    expect(state.glbArtifact).toBeNull()
    expect(clearIndex).toHaveBeenCalledTimes(1)
    clearIndex.mockRestore()
  })

  it('hands out fresh arrays, so a reset never shares one with the last model', () => {
    expect(modelStateDefaults().expandedElements).not.toBe(modelStateDefaults().expandedElements)
  })

  // The static half of #2019's session scoping: a load writes the model's
  // state only through its session's job (Containers/modelSession.js), so
  // CadView must not call these fields' setters itself. A new field declared
  // by the IFC or Browser slice is covered here by construction. The
  // NavTree's expansion is left out: the user's selection and search write
  // it, on the model shown. The close-time reset is store/modelState.js, and
  // the load report is loader/loadProgress.js's.
  it('CadView writes no load-written model field but through its load job', () => {
    const source = fs.readFileSync(path.join(__dirname, '../Containers/CadView.jsx'), 'utf8')
      // Comments may name the setters (and a commented-out block does).
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    const offenders = Object.keys({...ifcModelState(), ...browserModelState()})
      .map((key) => `set${key[0].toUpperCase()}${key.slice(1)}`)
      // A bare call or the store's (`getState().setModel`), not another
      // object's method of the same name (`viewer.isolator.setModel`).
      .filter((setter) => new RegExp(`(?:^|[^.\\w]|getState\\(\\)\\.)${setter}\\b`, 'm').test(source))
    expect(offenders).toEqual([])
  })
})
