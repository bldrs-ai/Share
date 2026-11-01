import React from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {StoreRouteThemeCtx} from '../Share.fixture'
import {
  IN_MEMORY_UPLOAD_GONE_ALERT,
  UPLOAD_NOT_IN_BROWSER_ALERT,
  inMemoryUploadGoneAlert,
  uploadNotInBrowserAlert,
} from '../OPFS/messages'
import {getProvider} from '../connections/registry'
import {ENGINE_FAILURE_ALERT_EVENT} from '../loader/engineOpenFailure'
import {NO_GEOMETRY_ALERT, noGeometryAlert} from '../loader/loadProgress'
import {
  UNRECOGNIZED_FORMAT_ALERT_EVENT,
  reportUnrecognizedFormat,
  unrecognizedFormatAlert,
} from '../loader/unrecognizedFormat'
import {REVIT} from '../loader/formatGuidance'
import {ARCHIVE_ENTRY_CHOICE, ARCHIVE_UNREADABLE, noModelInArchiveAlert} from '../loader/modelArchive'
import useStore from '../store/useStore'
import {trackAlert, trackAlertEvent} from '../utils/alertTracking'
import AlertDialog from './AlertDialog'


jest.mock('../connections/registry')
jest.mock('../utils/alertTracking', () => ({trackAlert: jest.fn(), trackAlertEvent: jest.fn()}))
jest.mock('../loader/unrecognizedFormat', () => ({
  ...jest.requireActual('../loader/unrecognizedFormat'),
  reportUnrecognizedFormat: jest.fn(),
}))


/**
 * Mute Sentry capture and console noise that AlertDialog emits when surfacing
 * an alert object — the tests are about UX behavior, not log shape.
 */
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
})


afterAll(() => {
  console.error.mockRestore?.()
})


describe('AlertDialog — needsReconnect alert type', () => {
  const onClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    act(() => {
      useStore.getState().setAlert(null)
    })
  })

  it('renders a Reconnect action button when alert.type is needsReconnect', () => {
    const connection = {id: 'conn-1', providerId: 'google-drive', label: 'a@x.com', meta: {}}
    act(() => {
      useStore.getState().setAlert({
        type: 'needsReconnect',
        connection,
        message: 'Your Google Drive session expired.',
      })
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getByText('Reconnect required')).toBeInTheDocument()
    expect(screen.getByText('Reconnect')).toBeInTheDocument()
    expect(screen.getByText('Your Google Drive session expired.')).toBeInTheDocument()
  })

  it('omits the Discord help footer for needsReconnect (it is recoverable, not a defect)', () => {
    const connection = {id: 'conn-1', providerId: 'google-drive', label: 'a@x.com', meta: {}}
    act(() => {
      useStore.getState().setAlert({
        type: 'needsReconnect',
        connection,
        message: 'Reconnect to continue.',
      })
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.queryByText(/Discord/i)).not.toBeInTheDocument()
  })

  it('invokes provider.getAccessToken when Reconnect is clicked', async () => {
    const connection = {id: 'conn-1', providerId: 'google-drive', label: 'a@x.com', meta: {}}
    const getAccessToken = jest.fn().mockResolvedValue('refreshed-token')
    getProvider.mockReturnValue({getAccessToken})

    act(() => {
      useStore.getState().setAlert({type: 'needsReconnect', connection, message: 'x'})
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})

    // Stub reload so the test environment doesn't actually reload jsdom.
    const reload = jest.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {...window.location, reload},
    })

    fireEvent.click(screen.getByText('Reconnect'))
    await waitFor(() => {
      expect(getAccessToken).toHaveBeenCalledWith(expect.objectContaining({id: 'conn-1'}))
    })
    expect(reload).toHaveBeenCalled()
  })

  it('keeps the dialog open when Reconnect is clicked but the user cancels the popup', async () => {
    const connection = {id: 'conn-1', providerId: 'google-drive', label: 'a@x.com', meta: {}}
    const getAccessToken = jest.fn().mockRejectedValue(new Error('user cancelled'))
    getProvider.mockReturnValue({getAccessToken})

    act(() => {
      useStore.getState().setAlert({type: 'needsReconnect', connection, message: 'x'})
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})

    fireEvent.click(screen.getByText('Reconnect'))
    await waitFor(() => {
      expect(getAccessToken).toHaveBeenCalled()
    })
    // Alert is still set — user can retry.
    expect(useStore.getState().alert).toMatchObject({type: 'needsReconnect'})
  })
})


describe('AlertDialog — trackAlert side effects', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    act(() => {
      useStore.getState().setAlert(null)
    })
  })

  /*
   * Regression for the SHARE-N5 / SHARE-RS double-report: trackAlert used
   * to be called from `createAlertReport` inside JSX, so a single load
   * failure produced one Sentry event *per re-render* of the dialog. The
   * effect-keyed-on-alert version must fire exactly once per distinct
   * alert value.
   */
  it('fires trackAlert exactly once per alert change, not per re-render', () => {
    const onClose = jest.fn()
    const error = new Error('Loader could not read model')
    act(() => {
      useStore.getState().setAlert(error)
    })
    const {rerender} = render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(trackAlert).toHaveBeenCalledTimes(1)
    expect(trackAlert).toHaveBeenCalledWith('Loader could not read model', error)

    // Force two extra renders without changing `alert`; trackAlert must
    // not fire again.
    rerender(<AlertDialog onClose={onClose}/>)
    rerender(<AlertDialog onClose={onClose}/>)
    expect(trackAlert).toHaveBeenCalledTimes(1)
  })

  it('fires trackAlert again when the alert changes to a different value', () => {
    const onClose = jest.fn()
    act(() => {
      useStore.getState().setAlert('Failed to parse model')
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(trackAlert).toHaveBeenCalledTimes(1)
    expect(trackAlert).toHaveBeenLastCalledWith('Failed to parse model')

    act(() => {
      useStore.getState().setAlert({
        type: 'oom',
        message: 'We ran out of memory attempting to load this model.',
      })
    })
    expect(trackAlert).toHaveBeenCalledTimes(2)
    expect(trackAlert).toHaveBeenLastCalledWith(
      'We ran out of memory attempting to load this model.',
      expect.objectContaining({type: 'oom'}),
    )
  })

  it('does not fire trackAlert when alert is null', () => {
    const onClose = jest.fn()
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(trackAlert).not.toHaveBeenCalled()
  })

  /*
   * StrictMode invokes effects twice in dev. The ref-gated dedup inside
   * AlertDialog should suppress the second invocation so trackAlert
   * fires exactly once per real alert change, even under StrictMode.
   * Simulating that here by wrapping the render in <React.StrictMode>.
   */
  it('does not double-fire trackAlert under React StrictMode', () => {
    const onClose = jest.fn()
    act(() => {
      useStore.getState().setAlert('Failed to parse model')
    })
    render(
      <React.StrictMode>
        <AlertDialog onClose={onClose}/>
      </React.StrictMode>,
      {wrapper: StoreRouteThemeCtx},
    )
    expect(trackAlert).toHaveBeenCalledTimes(1)
  })
})


describe('AlertDialog — unsupportedSchema alert type', () => {
  const onClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    act(() => {
      useStore.getState().setAlert(null)
    })
  })

  it('says the schema is not supported yet, in place of the generic Error header', () => {
    act(() => {
      useStore.getState().setAlert({
        type: 'unsupportedSchema',
        message: 'This model is IFC4X3_RC2 (IFC 4.3). Share can open some IFC 4.3 models, but not this one yet.',
      })
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getByText('Not supported yet')).toBeInTheDocument()
    expect(screen.queryByText('Error')).not.toBeInTheDocument()
    expect(screen.getByText(/IFC4X3_RC2 \(IFC 4\.3\)/)).toBeInTheDocument()
  })

  it('omits the Discord help footer (a documented limit, nothing for support to diagnose)', () => {
    act(() => {
      useStore.getState().setAlert({type: 'unsupportedSchema', message: 'Not displayable yet.'})
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.queryByText(/Discord/i)).not.toBeInTheDocument()
  })

  // trackAlert(message, alert) sends its second argument to Sentry, which
  // would undo CadView keeping this expected refusal out of it (codex
  // review of Share#1875). Analytics only.
  it('counts the alert in analytics only, never through the Sentry path', () => {
    act(() => {
      useStore.getState().setAlert({type: 'unsupportedSchema', message: 'Not displayable yet.'})
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(trackAlertEvent).toHaveBeenCalledWith('Not displayable yet.')
    expect(trackAlert).not.toHaveBeenCalled()
  })
})


describe('AlertDialog — engineFailure alert type (conway#742)', () => {
  const onClose = jest.fn()
  const message = 'Share couldn\'t read this file: zip archive (such as .ifczip), not STEP text.'

  beforeEach(() => {
    jest.clearAllMocks()
    act(() => {
      useStore.getState().setAlert(null)
    })
  })

  it('shows the engine\'s reason, and keeps the help footer: it is a real failure', () => {
    act(() => {
      useStore.getState().setAlert({type: 'engineFailure', message})
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getByText(/zip archive \(such as \.ifczip\), not STEP text/)).toBeInTheDocument()
    expect(screen.getByText(/Discord/i)).toBeInTheDocument()
  })

  // CadView captures the failure once, with the engine's status and reason;
  // a second capture of this plain alert object would carry neither.
  it('counts the alert in analytics only, never through the Sentry path, by a constant', () => {
    act(() => {
      useStore.getState().setAlert({type: 'engineFailure', message})
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(trackAlertEvent).toHaveBeenCalledTimes(1)
    expect(trackAlertEvent).toHaveBeenCalledWith(ENGINE_FAILURE_ALERT_EVENT)
    expect(trackAlert).not.toHaveBeenCalled()
  })
})


describe('AlertDialog — inMemoryUploadGone alert type', () => {
  const onClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    act(() => {
      useStore.getState().setAlert(null)
    })
  })

  it('explains the limit under its own header, without the Discord footer', () => {
    act(() => {
      useStore.getState().setAlert(inMemoryUploadGoneAlert())
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getByText('File no longer available')).toBeInTheDocument()
    expect(screen.queryByText('Error')).not.toBeInTheDocument()
    expect(screen.getByText(/opened from your computer in a previous page/)).toBeInTheDocument()
    expect(screen.queryByText(/Discord/i)).not.toBeInTheDocument()
  })

  // Nothing loaded, so OK closes the way a failed load does: onClose, which
  // AlertDialogAndSnackbar wires to navToDefault.
  it('closes with OK through onClose', () => {
    act(() => {
      useStore.getState().setAlert(inMemoryUploadGoneAlert())
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    fireEvent.click(screen.getByText('OK'))
    expect(useStore.getState().alert).toBeNull()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // A known limit of browsers without OPFS (#1906): counted once and kept
  // out of Sentry.
  it('counts the alert once, in analytics only', () => {
    act(() => {
      useStore.getState().setAlert(inMemoryUploadGoneAlert())
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(trackAlertEvent).toHaveBeenCalledTimes(1)
    expect(trackAlertEvent).toHaveBeenCalledWith(IN_MEMORY_UPLOAD_GONE_ALERT)
    expect(trackAlert).not.toHaveBeenCalled()
  })
})


describe('AlertDialog — uploadNotInBrowser alert type (#1955)', () => {
  const onClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    act(() => {
      useStore.getState().setAlert(null)
      useStore.getState().setIsOpenModelVisible(false)
    })
  })

  it('explains it under its own header, without the Discord footer', () => {
    act(() => {
      useStore.getState().setAlert(uploadNotInBrowserAlert())
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getByText('File not in this browser')).toBeInTheDocument()
    expect(screen.queryByText('Error')).not.toBeInTheDocument()
    expect(screen.getByText(/isn't in this browser/)).toBeInTheDocument()
    expect(screen.queryByText(/Discord/i)).not.toBeInTheDocument()
  })

  // The failed load left no model to stay on, so the action closes the way a
  // failed load does (onClose → navToDefault) and opens the Open dialog.
  it('"Open a file" closes the alert through onClose and opens the Open dialog', () => {
    act(() => {
      useStore.getState().setAlert(uploadNotInBrowserAlert())
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    fireEvent.click(screen.getByText('Open a file'))
    expect(useStore.getState().alert).toBeNull()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(useStore.getState().isOpenModelVisible).toBe(true)
  })

  it('counts the alert once, in analytics only', () => {
    act(() => {
      useStore.getState().setAlert(uploadNotInBrowserAlert())
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(trackAlertEvent).toHaveBeenCalledTimes(1)
    expect(trackAlertEvent).toHaveBeenCalledWith(UPLOAD_NOT_IN_BROWSER_ALERT)
    expect(trackAlert).not.toHaveBeenCalled()
  })
})


describe('AlertDialog — noGeometry alert type (#1962)', () => {
  const onClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    act(() => {
      useStore.getState().setAlert(null)
    })
  })

  it('says so under a non-error header, without the Discord footer', () => {
    act(() => {
      useStore.getState().setAlert(noGeometryAlert())
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getByText('No 3D geometry')).toBeInTheDocument()
    expect(screen.getByText(NO_GEOMETRY_ALERT)).toBeInTheDocument()
    expect(screen.queryByText('Error')).not.toBeInTheDocument()
    expect(screen.queryByText(/Discord/i)).not.toBeInTheDocument()
  })

  // The model did load, unlike every other alert here, so OK must not run
  // onClose (CadView's navToDefault would replace the model with the demo).
  it('OK dismisses the alert and leaves the model where it is', () => {
    act(() => {
      useStore.getState().setAlert(noGeometryAlert())
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    fireEvent.click(screen.getByText('OK'))
    expect(useStore.getState().alert).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('counts the alert once, in analytics only', () => {
    act(() => {
      useStore.getState().setAlert(noGeometryAlert())
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(trackAlertEvent).toHaveBeenCalledTimes(1)
    expect(trackAlertEvent).toHaveBeenCalledWith(NO_GEOMETRY_ALERT)
    expect(trackAlert).not.toHaveBeenCalled()
  })
})


describe('AlertDialog — unrecognizedFormat alert type', () => {
  const onClose = jest.fn()
  const message = 'Cannot extract filetype from filename: Tower.rvt'

  beforeEach(() => {
    jest.clearAllMocks()
    act(() => {
      useStore.getState().setAlert(null)
    })
  })

  // An extension with no guidance (loader/formatGuidance.js) keeps the
  // generic dialog: the alert's own text, the Error header, the Discord
  // footer. This used Tower.rvt until Revit got its own text (Share#2007).
  it('shows the alert\'s own text for a format with no guidance', () => {
    act(() => {
      useStore.getState().setAlert(
        unrecognizedFormatAlert('Cannot extract filetype from filename: Tower.bin', 'Tower.bin', 'picker'))
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getByText(/Cannot extract filetype from filename: Tower\.bin/)).toBeInTheDocument()
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText(/Discord/)).toBeInTheDocument()
  })

  it('guides a Revit file to IFC export instead of the generic text', () => {
    act(() => {
      useStore.getState().setAlert(unrecognizedFormatAlert(message, 'Tower.rvt', 'picker'))
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getByText('Revit file')).toBeInTheDocument()
    for (const line of REVIT.lines) {
      expect(screen.getByText(line)).toBeInTheDocument()
    }
    const help = screen.getByRole('link', {name: 'How to export IFC from Revit'})
    expect(help).toHaveAttribute('href', '/help/native-cad-files/#revit')
    expect(help).toHaveAttribute('target', '_blank')
    // The guidance replaces the generic sentence, header and footer.
    expect(screen.queryByText(/Cannot extract filetype/)).not.toBeInTheDocument()
    expect(screen.queryByText('Error')).not.toBeInTheDocument()
    expect(screen.queryByText(/Discord/)).not.toBeInTheDocument()
  })

  // The drop path's message is different (it names the type and size, not
  // the file), and the guidance comes from `ext` alone, so it lands the same.
  it('guides a dropped file by its extension too', () => {
    act(() => {
      useStore.getState().setAlert(
        unrecognizedFormatAlert('File upload of unknown type: type() size(42)', 'Bracket.SLDPRT', 'drop'))
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getByText('SolidWorks file')).toBeInTheDocument()
    expect(screen.queryByText(/File upload of unknown type/)).not.toBeInTheDocument()
  })

  // A guidance entry need not carry a link; the archive one doesn't.
  it('renders guidance with no help link', () => {
    act(() => {
      useStore.getState().setAlert(unrecognizedFormatAlert('x', 'plans.rar', 'drop'))
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getByText('Compressed archive')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('Reset still closes a guided alert the way a failed load does', () => {
    act(() => {
      useStore.getState().setAlert(unrecognizedFormatAlert(message, 'Tower.rvt', 'picker'))
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    fireEvent.click(screen.getByText('Reset'))
    expect(useStore.getState().alert).toBeNull()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // As a string this went through trackAlert, whose fingerprint is the
  // message text — with the file name in it, one Sentry issue per pick.
  it('counts the alert once as an info report, with a constant analytics label', () => {
    const alert = unrecognizedFormatAlert(message, 'Tower.rvt', 'picker')
    act(() => {
      useStore.getState().setAlert(alert)
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(reportUnrecognizedFormat).toHaveBeenCalledTimes(1)
    expect(reportUnrecognizedFormat).toHaveBeenCalledWith(alert)
    expect(trackAlertEvent).toHaveBeenCalledTimes(1)
    expect(trackAlertEvent).toHaveBeenCalledWith(UNRECOGNIZED_FORMAT_ALERT_EVENT)
    expect(trackAlert).not.toHaveBeenCalled()
  })
})


// Share#2006: a zip Share looked inside (loader/modelArchive.js).
describe('AlertDialog — archives', () => {
  const onClose = jest.fn()
  const entries = [
    {path: 'export/Tower.ifc', name: 'Tower.ifc', ext: 'ifc'},
    {path: 'part.glb', name: 'part.glb', ext: 'glb'},
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    act(() => {
      useStore.getState().setAlert(null)
    })
  })

  /**
   * @param {object} [overrides]
   * @return {object} a chooser alert with a mock onChoose
   */
  function chooser(overrides = {}) {
    return {type: ARCHIVE_ENTRY_CHOICE, entries, revitTextSiblings: [], onChoose: jest.fn(), ...overrides}
  }

  it('lists the models to choose from, each by name and folder', () => {
    act(() => {
      useStore.getState().setAlert(chooser())
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getByText('Choose a model')).toBeInTheDocument()
    expect(screen.getByText('This archive holds 2 models Share can open. Choose one:')).toBeInTheDocument()
    expect(screen.getByTestId('archive-entry-export/Tower.ifc')).toHaveTextContent('Tower.ifcexport')
    expect(screen.getByTestId('archive-entry-part.glb')).toHaveTextContent(/^part\.glb$/)
    // A question, not an error: no error header, no Reset, no Discord.
    expect(screen.queryByText('Error')).not.toBeInTheDocument()
    expect(screen.queryByText('Reset')).not.toBeInTheDocument()
    expect(screen.queryByText(/Discord/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Revit writes/)).not.toBeInTheDocument()
  })

  it('opens the model chosen, and takes the chooser down', () => {
    const alert = chooser()
    act(() => {
      useStore.getState().setAlert(alert)
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    fireEvent.click(screen.getByText('part.glb'))
    expect(alert.onChoose).toHaveBeenCalledTimes(1)
    expect(alert.onChoose).toHaveBeenCalledWith(entries[1])
    expect(useStore.getState().alert).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  // The chooser was raised over whatever model was open; closing it must not
  // navigate away from that model (onClose → navToDefault).
  it('closing it leaves the open model where it is', () => {
    const alert = chooser()
    act(() => {
      useStore.getState().setAlert(alert)
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    fireEvent.click(screen.getByTestId('button-close-dialog-choose-a-model'))
    expect(useStore.getState().alert).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(alert.onChoose).not.toHaveBeenCalled()
  })

  it('names a Revit export\'s .txt sibling, which it doesn\'t list', () => {
    act(() => {
      useStore.getState().setAlert(chooser({revitTextSiblings: ['export/Tower.ifc']}))
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getByText(/The \.txt next to export\/Tower\.ifc is the file Revit writes beside an IFC export/))
      .toBeInTheDocument()
  })

  // Entry names are the user's file names; nothing about a chooser is counted.
  it('reports nothing for a chooser', () => {
    act(() => {
      useStore.getState().setAlert(chooser())
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(trackAlert).not.toHaveBeenCalled()
    expect(trackAlertEvent).not.toHaveBeenCalled()
    expect(reportUnrecognizedFormat).not.toHaveBeenCalled()
  })

  it('says what an archive with no model holds, and is counted as an unrecognized format', () => {
    const alert = noModelInArchiveAlert('drawings.zip', 'drop', ['dwg', 'pdf'])
    act(() => {
      useStore.getState().setAlert(alert)
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getByText('No model in this archive')).toBeInTheDocument()
    expect(screen.getByText('This archive has no model Share can open (it contains .dwg and .pdf).'))
      .toBeInTheDocument()
    expect(reportUnrecognizedFormat).toHaveBeenCalledWith(alert)
    expect(trackAlertEvent).toHaveBeenCalledWith(UNRECOGNIZED_FORMAT_ALERT_EVENT)
  })

  // A .docx is a zip with no model in it; its own guidance says it better.
  it('keeps a guided extension\'s own text for an archive that is one', () => {
    act(() => {
      useStore.getState().setAlert(noModelInArchiveAlert('Spec.docx', 'drop', ['xml', 'rels']))
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getByText('Not a 3D model')).toBeInTheDocument()
    expect(screen.queryByText(/This archive/)).not.toBeInTheDocument()
  })

  // The click finishes the drop or pick; a failure there must still reach
  // the dialog rather than vanish as an unhandled rejection.
  it('shows what a choice failed with', async () => {
    const failure = new Error('OPFS said no')
    act(() => {
      useStore.getState().setAlert(chooser({onChoose: jest.fn().mockRejectedValue(failure)}))
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    fireEvent.click(screen.getByText('part.glb'))
    await waitFor(() => expect(useStore.getState().alert).toBe(failure))
  })

  it('lists the first 50 models and counts the rest', () => {
    const LISTED = 50
    const MODELS = 60
    const many = Array.from({length: MODELS}, (_, i) => ({path: `parts/p${i}.stl`, name: `p${i}.stl`, ext: 'stl'}))
    act(() => {
      useStore.getState().setAlert(chooser({entries: many}))
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getByText('This archive holds 60 models Share can open. Choose one:')).toBeInTheDocument()
    expect(screen.getAllByRole('button').filter((b) => b.dataset.testid?.startsWith('archive-entry-'))).toHaveLength(LISTED)
    expect(screen.getByTestId('archive-entry-unlisted')).toHaveTextContent('And 10 more.')
  })

  it('lists two entries of one path as two rows, without a key collision', () => {
    console.error.mockClear()
    const twins = [entries[1], {...entries[1]}]
    act(() => {
      useStore.getState().setAlert(chooser({entries: twins}))
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getAllByTestId('archive-entry-part.glb')).toHaveLength(2)
    const keyWarnings = console.error.mock.calls.filter((args) => String(args[0]).includes('same key'))
    expect(keyWarnings).toEqual([])
  })

  // A hosted .ifczip that isn't one readable IFC (CadView raises it).
  it('says why a hosted .ifczip can\'t be opened, counted in analytics only', () => {
    const message = 'This .ifczip holds no IFC model.'
    act(() => {
      useStore.getState().setAlert({type: ARCHIVE_UNREADABLE, message})
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getByText('Can\'t open this archive')).toBeInTheDocument()
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.queryByText(/Discord/)).not.toBeInTheDocument()
    expect(trackAlertEvent).toHaveBeenCalledWith(message)
    expect(trackAlert).not.toHaveBeenCalled()
    expect(reportUnrecognizedFormat).not.toHaveBeenCalled()
  })

  it('says why an archive can\'t be read', () => {
    const problem = 'This archive is password-protected. Unpack it first, then open the model inside.'
    act(() => {
      useStore.getState().setAlert({...unrecognizedFormatAlert(problem, 'Tower.zip', 'picker'), archive: {problem}})
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getByText('Can\'t open this archive')).toBeInTheDocument()
    expect(screen.getByText(problem)).toBeInTheDocument()
  })
})
