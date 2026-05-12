import React, {useState} from 'react'
import {act, fireEvent, render} from '@testing-library/react'
import GoogleDrivePickerDialog from './GoogleDrivePickerDialog'


jest.mock('../../connections/google-drive/loadGisScript', () => ({
  loadPickerScript: jest.fn().mockResolvedValue(undefined),
}))


/**
 * Make a chainable no-op object: every method on `methodNames` returns the
 * same instance. Avoids class boilerplate in test fakes.
 *
 * @param {Array<string>} methodNames Names of chainable methods to install
 * @return {object} Instance with each named method as a chainable no-op
 */
function chainable(methodNames) {
  const obj = {}
  methodNames.forEach((name) => {
    obj[name] = () => obj
  })
  return obj
}


/**
 * Install a minimal `window.google.picker` fake on the global so the dialog
 * can build a picker without the real script. Records each `build()` call
 * and exposes the most recently built picker (with the registered callback)
 * for invocation from tests.
 *
 * @return {object} {buildSpy, getLastPicker}
 */
function installGoogleFake() {
  const buildSpy = jest.fn()
  let lastPicker = null

  /**
   * Construct a fake picker builder. Each setter is chainable; setCallback
   * stashes the callback for retrieval after build().
   *
   * @return {object} Chainable builder with build()
   */
  function PickerBuilder() {
    let storedCallback = null
    const builder = chainable([
      'addView', 'setOAuthToken', 'setDeveloperKey', 'setAppId',
      'enableFeature', 'setTitle', 'setSize',
    ])
    /**
     * @param {Function} cb Callback to invoke on PICKED/CANCEL
     * @return {object} The builder
     */
    builder.setCallback = (cb) => {
      storedCallback = cb
      return builder
    }
    /**
     * @return {object} A picker instance with the registered callback
     */
    builder.build = () => {
      buildSpy()
      lastPicker = {
        _callback: storedCallback,
        setVisible: jest.fn(),
        dispose: jest.fn(),
      }
      return lastPicker
    }
    return builder
  }

  /**
   * @return {object} A chainable DocsView fake
   */
  function DocsView() {
    return chainable(['setMimeTypes', 'setIncludeFolders', 'setSelectFolderEnabled', 'setMode'])
  }

  window.google = {
    picker: {
      PickerBuilder,
      DocsView,
      ViewId: {DOCS: 'DOCS', FOLDERS: 'FOLDERS'},
      DocsViewMode: {LIST: 'LIST', GRID: 'GRID'},
      Feature: {SUPPORT_DRIVES: 'SUPPORT_DRIVES'},
      Action: {PICKED: 'PICKED', CANCEL: 'CANCEL'},
      Response: {ACTION: 'action', DOCUMENTS: 'docs'},
      Document: {
        ID: 'id',
        NAME: 'name',
        URL: 'url',
        MIME_TYPE: 'mimeType',
        PARENT_ID: 'parentId',
        LAST_EDITED_UTC: 'lastEditedUtc',
      },
    },
  }

  /**
   * @return {object|null} The most recently built picker, or null
   */
  const getLastPicker = () => lastPicker
  return {buildSpy, getLastPicker}
}


describe('GoogleDrivePickerDialog', () => {
  let originalGoogle

  beforeEach(() => {
    originalGoogle = window.google
  })

  afterEach(() => {
    window.google = originalGoogle
    jest.clearAllMocks()
  })

  it('builds the picker exactly once across parent re-renders with fresh callback identities', async () => {
    const {buildSpy} = installGoogleFake()
    const onSelect = jest.fn()
    const onCancel = jest.fn()

    /**
     * Force re-renders with fresh inline callback identity each time —
     * exactly the scenario that used to thrash the build effect.
     *
     * @return {React.Element}
     */
    function Host() {
      const [tick, setTick] = useState(0)
      return (
        <div>
          <button data-testid='bump' onClick={() => setTick(tick + 1)}>{`bump-${tick}`}</button>
          <GoogleDrivePickerDialog
            accessToken='fake-token'
            isOpen={true}
            mode='file'
            onSelect={(docs) => onSelect(docs)}
            onCancel={() => onCancel()}
          />
        </div>
      )
    }

    const {getByTestId} = render(<Host/>)
    await act(async () => {
      await Promise.resolve()
    })
    expect(buildSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      fireEvent.click(getByTestId('bump'))
      fireEvent.click(getByTestId('bump'))
      fireEvent.click(getByTestId('bump'))
      await Promise.resolve()
    })
    expect(buildSpy).toHaveBeenCalledTimes(1)
  })

  it('routes PICKED through the latest onSelect even after parent swaps it', async () => {
    const {getLastPicker} = installGoogleFake()
    const calls = []
    const onCancel = jest.fn()

    let setOnSelectExternal
    /**
     * @return {React.Element}
     */
    function SwappableHost() {
      const [onSelect, setOnSelect] = useState(() => (docs) => calls.push({version: 'initial', docs}))
      setOnSelectExternal = setOnSelect
      return (
        <GoogleDrivePickerDialog
          accessToken='fake-token'
          isOpen={true}
          mode='file'
          onSelect={onSelect}
          onCancel={onCancel}
        />
      )
    }

    render(<SwappableHost/>)
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      setOnSelectExternal(() => (docs) => calls.push({version: 'updated', docs}))
      await Promise.resolve()
    })

    const picker = getLastPicker()
    act(() => {
      picker._callback({
        action: 'PICKED',
        docs: [{
          id: 'file-id-1',
          name: 'haus.ifc',
          url: 'https://drive/x',
          mimeType: 'application/octet-stream',
          parentId: 'parent-1',
          lastEditedUtc: 1735000000000,
        }],
      })
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].version).toBe('updated')
    expect(calls[0].docs[0]).toEqual({
      id: 'file-id-1',
      name: 'haus.ifc',
      url: 'https://drive/x',
      mimeType: 'application/octet-stream',
      parentId: 'parent-1',
      lastModifiedUtc: 1735000000000,
    })
  })

  it('disposes the picker when isOpen flips to false', async () => {
    const {getLastPicker} = installGoogleFake()
    const onSelect = jest.fn()
    const onCancel = jest.fn()

    /**
     * @param {object} props
     * @param {boolean} props.open Whether the picker is open
     * @return {React.Element}
     */
    function Toggleable({open}) {
      return (
        <GoogleDrivePickerDialog
          accessToken='fake-token'
          isOpen={open}
          mode='file'
          onSelect={onSelect}
          onCancel={onCancel}
        />
      )
    }

    const {rerender} = render(<Toggleable open={true}/>)
    await act(async () => {
      await Promise.resolve()
    })
    const picker = getLastPicker()
    expect(picker).not.toBeNull()

    rerender(<Toggleable open={false}/>)
    expect(picker.dispose).toHaveBeenCalledTimes(1)
  })
})
