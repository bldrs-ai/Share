import React from 'react'
import {useNavigate} from 'react-router-dom'
import '@testing-library/jest-dom/extend-expect'
import {act, render, screen, waitFor} from '@testing-library/react'
import ViewerContainer from './ViewerContainer'
import useStore from '../store/useStore'


// We will mock out relevant modules (store, guessType, OPFS saving, fallback saving)
jest.mock('../store/useStore', () => {
  // We'll return a mock function that itself returns
  // a function or object with the relevant keys
  return jest.fn().mockImplementation((selector) => {
    // The store has a variety of keys
    // The ones we need for the tested code are:
    //   appPrefix, isModelReady, isOpfsAvailable, vh, setAlert
    // For simplicity, we can just assume they're all "happy path" default values
    const state = {
      appPrefix: '/app',
      isModelReady: true,
      isOpfsAvailable: true, // or toggle this for specific tests
      vh: 800,
      setAlert: jest.fn(),
    }
    return selector(state)
  })
})

jest.mock('react-router-dom', () => ({useNavigate: jest.fn()}))
jest.mock('../Filetype', () => ({guessTypeFromFile: jest.fn()}))
jest.mock('../OPFS/utils', () => ({saveDnDFileToOpfs: jest.fn()}))
jest.mock('../utils/loader', () => ({saveDnDFileToOpfsFallback: jest.fn()}))

// We'll import the real dependencies from the mocks above
import {guessTypeFromFile} from '../Filetype'
import {saveDnDFileToOpfs} from '../OPFS/utils'
import {saveDnDFileToOpfsFallback} from '../utils/loader'


describe('ViewerContainer', () => {
  const mockNavigate = jest.fn()
  const mockSetAlert = jest.fn()

  beforeAll(() => {
    window.DragEvent = DragEvent
  })

  beforeEach(() => {
    jest.clearAllMocks()
    // Make useNavigate() return our mocked `mockNavigate`
    useNavigate.mockReturnValue(mockNavigate)
    // Make useStore return our mocked setAlert
    useStore.mockImplementation((selector) => {
      const state = {
        appPrefix: '/app',
        isModelReady: true,
        isOpfsAvailable: true,
        vh: 800,
        setAlert: mockSetAlert,
      }
      return selector(state)
    })
  })

  afterAll(() => {
    window.DragEvent = null
  })

  test('renders the container', () => {
    render(<ViewerContainer/>)
    const dropzone = screen.getByTestId('cadview-dropzone')
    expect(dropzone).toBeInTheDocument()
  })

  test('calls preventDefault and sets drag state on drag over', () => {
    // We won't see a direct "setIsDragActive" effect in the DOM unless we visually wire it up,
    // but we can ensure the event is prevented.
    render(<ViewerContainer/>)
    const dropzone = screen.getByTestId('cadview-dropzone')

    const mockEvent = new DragEvent('dragover', {bubbles: true})
    Object.defineProperty(mockEvent, 'preventDefault', {value: jest.fn()})

    act(() => {
      dropzone.dispatchEvent(mockEvent)
    })
    expect(mockEvent.preventDefault).toHaveBeenCalled()
  })

  test('calls preventDefault on drag leave', () => {
    render(<ViewerContainer/>)
    const dropzone = screen.getByTestId('cadview-dropzone')

    const mockEvent = new DragEvent('dragleave', {bubbles: true})
    Object.defineProperty(mockEvent, 'preventDefault', {value: jest.fn()})

    dropzone.dispatchEvent(mockEvent)
    expect(mockEvent.preventDefault).toHaveBeenCalled()
  })

  test('shows alert if 0 files are dropped', async () => {
    render(<ViewerContainer/>)
    const dropzone = screen.getByTestId('cadview-dropzone')

    // Create a mock drop event with no files
    const dataTransfer = {files: []}
    const mockEvent = new DragEvent('drop', {bubbles: true})
    Object.defineProperty(mockEvent, 'dataTransfer', {value: dataTransfer})
    Object.defineProperty(mockEvent, 'preventDefault', {value: jest.fn()})

    dropzone.dispatchEvent(mockEvent)
    await waitFor(() => {
      expect(mockSetAlert).toHaveBeenCalledWith('File upload initiated but found no data')
    })
  })

  test('shows alert if more than 1 file is dropped', async () => {
    render(<ViewerContainer/>)
    const dropzone = screen.getByTestId('cadview-dropzone')

    const file1 = new File(['some content'], 'file1.txt', {type: 'text/plain'})
    const file2 = new File(['some content'], 'file2.txt', {type: 'text/plain'})

    const dataTransfer = {files: [file1, file2]}
    const mockEvent = new DragEvent('drop', {bubbles: true})
    Object.defineProperty(mockEvent, 'dataTransfer', {value: dataTransfer})
    Object.defineProperty(mockEvent, 'preventDefault', {value: jest.fn()})

    dropzone.dispatchEvent(mockEvent)
    await waitFor(() => {
      expect(mockSetAlert).toHaveBeenCalledWith('File upload initiated for more than 1 file')
    })
  })

  test('shows alert if guessTypeFromFile returns null', async () => {
    guessTypeFromFile.mockResolvedValueOnce(null)

    render(<ViewerContainer/>)
    const dropzone = screen.getByTestId('cadview-dropzone')

    const file = new File(['some content'], 'unrecognized.abc', {type: 'application/x-unknown'})
    const dataTransfer = {files: [file]}
    const mockEvent = new DragEvent('drop', {bubbles: true})
    Object.defineProperty(mockEvent, 'dataTransfer', {value: dataTransfer})
    Object.defineProperty(mockEvent, 'preventDefault', {value: jest.fn()})

    dropzone.dispatchEvent(mockEvent)
    await waitFor(() => {
      expect(mockSetAlert).toHaveBeenCalledWith(
        `File upload of unknown type: type(${file.type}) size(${file.size})`,
      )
    })
  })

  test('saves via OPFS if recognized type and isOpfsAvailable = true', async () => {
    guessTypeFromFile.mockResolvedValueOnce('my-recognized-type')
    // Just ensure the actual saving call eventually calls onWritten => navigate.
    // We can simulate that by calling the third param from saveDnDFileToOpfs
    saveDnDFileToOpfs.mockImplementation((_file, _type, onWritten) => {
      onWritten('myUploadedFileName')
    })

    render(<ViewerContainer/>)
    const dropzone = screen.getByTestId('cadview-dropzone')

    const file = new File(['some content'], 'test.glb', {type: 'model/gltf-binary'})
    const dataTransfer = {files: [file]}
    const mockEvent = new DragEvent('drop', {bubbles: true})
    Object.defineProperty(mockEvent, 'dataTransfer', {value: dataTransfer})
    Object.defineProperty(mockEvent, 'preventDefault', {value: jest.fn()})

    dropzone.dispatchEvent(mockEvent)

    // Make sure we navigate to /app/v/new/myUploadedFileName
    await waitFor(() => {
      expect(saveDnDFileToOpfs).toHaveBeenCalledTimes(1)
      expect(mockNavigate).toHaveBeenCalledWith('/app/v/new/myUploadedFileName')
    })
  })

  test('saves via fallback if recognized type and isOpfsAvailable = false', async () => {
    // We'll temporarily make the store return "false" for isOpfsAvailable
    // Easiest approach is to override the mock in the middle of the test
    // or we can do a specialized mock implementation.
    // We'll do a quick override:
    useStore.mockImplementation((selector) => {
      const state = {
        appPrefix: '/app',
        isModelReady: true,
        isOpfsAvailable: false, // now false
        vh: 800,
        setAlert: mockSetAlert,
      }
      return selector(state)
    })

    guessTypeFromFile.mockResolvedValueOnce('my-recognized-type')
    saveDnDFileToOpfsFallback.mockImplementation((_file, onWritten) => {
      onWritten('myFallbackFileName')
    })

    render(<ViewerContainer/>)
    const dropzone = screen.getByTestId('cadview-dropzone')

    const file = new File(['some content'], 'test.glb', {type: 'model/gltf-binary'})
    const dataTransfer = {files: [file]}
    const mockEvent = new DragEvent('drop', {bubbles: true})
    Object.defineProperty(mockEvent, 'dataTransfer', {value: dataTransfer})
    Object.defineProperty(mockEvent, 'preventDefault', {value: jest.fn()})

    dropzone.dispatchEvent(mockEvent)

    await waitFor(() => {
      expect(saveDnDFileToOpfsFallback).toHaveBeenCalledTimes(1)
      expect(mockNavigate).toHaveBeenCalledWith('/app/v/new/myFallbackFileName')
    })
  })
})


/**
 * This is a workaround to fix the error:
 * "ReferenceError: Can't find variable: DragEvent"
 *
 * This is a known issue in Jest:
 * https://github.com/facebook/jest/issues/10508
 */
class DragEvent extends Event {
  /**
   * @param {string} type
   * @param {object} eventInitDict
   */
  constructor(type, eventInitDict = {}) {
    super(type, eventInitDict)
    this.dataTransfer = eventInitDict.dataTransfer || {}
  }
}
