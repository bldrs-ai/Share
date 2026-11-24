import React, {useState} from 'react'
import {act, fireEvent, render, screen} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../Share.fixture'
import FeedbackNote, {CAPTURE_FAILED_TEXT} from './FeedbackNote'
import {captureViewerScreenshot} from './captureScreenshot'
import {SCREENSHOT} from './feedback.fixture'


jest.mock('./captureScreenshot', () => ({captureViewerScreenshot: jest.fn()}))


/**
 * The note area with its state held as a source would hold it.
 *
 * @param {object} props
 * @return {React.ReactElement}
 */
function Harness({onSend = () => undefined, onCancel = () => undefined, ...props}) {
  const [note, setNote] = useState('')
  const [screenshot, setScreenshot] = useState(null)
  return (
    <FeedbackNote
      source='general'
      note={note}
      onNoteChange={setNote}
      screenshot={screenshot}
      onScreenshotChange={setScreenshot}
      onSend={() => onSend({note, screenshot})}
      onCancel={onCancel}
      placeholder='Say something'
      helperText='Shared with Bldrs.'
      {...props}
    />
  )
}


describe('feedback/FeedbackNote', () => {
  beforeEach(() => {
    jest.mocked(captureViewerScreenshot).mockReset()
  })

  it('opens focused on the note, with what is shared, and no screenshot until asked', () => {
    render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
    expect(screen.getByPlaceholderText('Say something')).toHaveFocus()
    expect(screen.getByText('Shared with Bldrs.')).toBeInTheDocument()
    expect(screen.queryByTestId('Feedback-Screenshot')).toBeNull()
    expect(captureViewerScreenshot).not.toHaveBeenCalled()
  })

  it('attaches a screenshot as a thumbnail, removes it with ×, and attaches again', async () => {
    jest.mocked(captureViewerScreenshot).mockResolvedValue(SCREENSHOT)
    const onSend = jest.fn()
    render(<Harness onSend={onSend}/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: 'Attach screenshot'}))
    const thumb = await screen.findByTestId('Feedback-Screenshot')
    expect(thumb.querySelector('img')).toHaveAttribute('src', SCREENSHOT)
    expect(captureViewerScreenshot).toHaveBeenCalledWith({source: 'general'})
    // While one is attached, attaching is replaced by its remove badge.
    expect(screen.queryByRole('button', {name: 'Attach screenshot'})).toBeNull()

    fireEvent.click(screen.getByRole('button', {name: 'Remove screenshot'}))
    expect(screen.queryByTestId('Feedback-Screenshot')).toBeNull()
    fireEvent.click(screen.getByRole('button', {name: 'Attach screenshot'}))
    await screen.findByTestId('Feedback-Screenshot')
    expect(captureViewerScreenshot).toHaveBeenCalledTimes(2)

    fireEvent.change(screen.getByPlaceholderText('Say something'), {target: {value: 'look'}})
    fireEvent.click(screen.getByTestId('Feedback-Send'))
    expect(onSend).toHaveBeenCalledWith({note: 'look', screenshot: SCREENSHOT})
  })

  it('sends without a screenshot when none was attached, or after it was removed', async () => {
    jest.mocked(captureViewerScreenshot).mockResolvedValue(SCREENSHOT)
    const onSend = jest.fn()
    render(<Harness onSend={onSend}/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.keyDown(screen.getByPlaceholderText('Say something'), {key: 'Enter'})
    expect(onSend).toHaveBeenLastCalledWith({note: '', screenshot: null})
    fireEvent.click(screen.getByRole('button', {name: 'Attach screenshot'}))
    await screen.findByTestId('Feedback-Screenshot')
    fireEvent.click(screen.getByRole('button', {name: 'Remove screenshot'}))
    fireEvent.click(screen.getByTestId('Feedback-Send'))
    expect(onSend).toHaveBeenLastCalledWith({note: '', screenshot: null})
  })

  // Codex round 2 on #2313: Enter must not send while a requested capture runs.
  it('Enter waits for a capture in flight: nothing is sent until the screenshot lands', async () => {
    let finish = () => undefined
    jest.mocked(captureViewerScreenshot).mockReturnValue(new Promise((resolve) => {
      finish = () => resolve(SCREENSHOT)
    }))
    const onSend = jest.fn()
    render(<Harness onSend={onSend}/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: 'Attach screenshot'}))
    const note = screen.getByPlaceholderText('Say something')
    fireEvent.keyDown(note, {key: 'Enter'})
    fireEvent.submit(screen.getByTestId('Feedback-Note'))
    expect(screen.getByTestId('Feedback-Send')).toBeDisabled()
    expect(onSend).not.toHaveBeenCalled()
    await act(() => Promise.resolve(finish()))
    await screen.findByTestId('Feedback-Screenshot')
    fireEvent.keyDown(note, {key: 'Enter'})
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith({note: '', screenshot: SCREENSHOT})
  })

  // Codex round 3 on #2313: a capture that outlives its note area is dropped.
  it('drops a capture that lands after the note area closed', async () => {
    let finish = () => undefined
    jest.mocked(captureViewerScreenshot).mockReturnValue(new Promise((resolve) => {
      finish = () => resolve(SCREENSHOT)
    }))
    const onScreenshotChange = jest.fn()
    const {unmount} = render(
      <FeedbackNote source='general' note='' onNoteChange={() => undefined} screenshot={null}
        onScreenshotChange={onScreenshotChange} onSend={() => undefined} onCancel={() => undefined}
        placeholder='Say something' helperText='Shared with Bldrs.'
      />,
      {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: 'Attach screenshot'}))
    unmount()
    await act(() => Promise.resolve(finish()))
    expect(onScreenshotChange).not.toHaveBeenCalled()
  })

  it('a failed capture is a quiet hint, and the user can try again', async () => {
    jest.mocked(captureViewerScreenshot).mockResolvedValueOnce(null).mockResolvedValueOnce(SCREENSHOT)
    render(<Harness/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByRole('button', {name: 'Attach screenshot'}))
    expect(await screen.findByText(CAPTURE_FAILED_TEXT)).toBeInTheDocument()
    expect(screen.queryByTestId('Feedback-Screenshot')).toBeNull()
    fireEvent.click(screen.getByRole('button', {name: 'Attach screenshot'}))
    await screen.findByTestId('Feedback-Screenshot')
    expect(screen.queryByText(CAPTURE_FAILED_TEXT)).toBeNull()
  })

  it('a locked note (a retry) can be sent or cancelled, not changed', () => {
    const onCancel = jest.fn()
    render(<Harness isLocked onCancel={onCancel} hint={'Couldn\'t send.'}/>, {wrapper: HelmetStoreRouteThemeCtx})
    expect(screen.getByPlaceholderText('Say something')).toBeDisabled()
    expect(screen.getByRole('button', {name: 'Attach screenshot'})).toBeDisabled()
    expect(screen.getByTestId('Feedback-Hint')).toHaveTextContent('Couldn\'t send.')
    expect(screen.getByTestId('Feedback-Send')).toBeEnabled()
    fireEvent.click(screen.getByTestId('Feedback-Cancel'))
    expect(onCancel).toHaveBeenCalled()
  })
})
