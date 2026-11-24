import React, {ReactElement, useEffect, useRef, useState} from 'react'
import {Box, Button, IconButton, TextField, Tooltip, Typography, useTheme} from '@mui/material'
import {AddPhotoAlternateOutlined as AttachScreenshotIcon, Close as CloseIcon} from '@mui/icons-material'
import {captureViewerScreenshot} from './captureScreenshot'
import {MAX_NOTE_CHARS} from './feedbackRecord'


export const CAPTURE_FAILED_TEXT = 'Couldn\'t capture the view.'


/**
 * The note area every feedback source composes (design/tracks/community-t100/feedback.md
 * §"UI pieces"): a short note, an opt-in screenshot of the 3D view shown as
 * an attachment with an × to remove it, what is shared and with whom, and
 * Cancel / Send. The source owns what Send does (submitFeedback.js) and
 * what the note is about; this owns the field, the capture and its look.
 *
 * The screenshot is taken only when the user presses "Attach screenshot"
 * (captureScreenshot.js); a failed capture is a quiet hint here.
 *
 * @property {string} source FEEDBACK_SOURCES, for a failed capture's count
 * @property {string} note what the user has typed
 * @property {Function} onNoteChange `(note) => void`
 * @property {?string} screenshot a JPEG data URL, or null
 * @property {Function} onScreenshotChange `(screenshot | null) => void`
 * @property {Function} onSend sends the feedback (the source's)
 * @property {Function} onCancel closes the area without sending
 * @property {string} placeholder the empty note's prompt
 * @property {string} helperText what is shared, with Bldrs, and why
 * @property {boolean} [isSending] a send is in flight
 * @property {boolean} [isLocked] the record is built (a retry after a failed
 *   send): the note and screenshot can't change, only be sent again or cancelled
 * @property {?string} [hint] the source's quiet status line (a failed send)
 * @return {ReactElement}
 */
export default function FeedbackNote({
  source, note, onNoteChange, screenshot, onScreenshotChange, onSend, onCancel, placeholder, helperText,
  isSending = false, isLocked = false, hint = null,
}) {
  const theme = useTheme()
  const noteRef = useRef(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [captureHint, setCaptureHint] = useState(null)
  // Each capture is this note area's, and only while it is open: a capture
  // still running when the user cancels must not land in the next note area
  // opened (Codex on #2313). The area unmounts on Cancel, so a result that
  // arrives after that, or after a newer capture started, is dropped.
  const isOpenRef = useRef(true)
  const captureSeqRef = useRef(0)
  // The note takes focus when the area opens, so the user can type, or
  // press Enter to send without a note.
  useEffect(() => {
    isOpenRef.current = true
    noteRef.current?.focus()
    return () => {
      isOpenRef.current = false
    }
  }, [])

  const attach = async () => {
    const seq = ++captureSeqRef.current
    setIsCapturing(true)
    setCaptureHint(null)
    const shot = await captureViewerScreenshot({source})
    if (!isOpenRef.current || seq !== captureSeqRef.current) {
      return
    }
    setIsCapturing(false)
    if (shot) {
      onScreenshotChange(shot)
    } else {
      setCaptureHint(CAPTURE_FAILED_TEXT)
    }
  }

  const isFrozen = isSending || isLocked
  // One condition for the button and the keyboard: Enter while a capture
  // the user asked for is still running would send without it, and the
  // screenshot would be dropped when it lands (Codex on #2313).
  const canSend = !isSending && !isCapturing
  const send = () => {
    if (canSend) {
      onSend()
    }
  }
  const shownHint = hint ?? captureHint
  return (
    <Box
      component='form'
      data-testid='Feedback-Note'
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
      sx={{display: 'flex', flexDirection: 'column', gap: 0.75}}
    >
      <TextField
        size='small'
        multiline
        maxRows={4}
        inputRef={noteRef}
        value={note}
        disabled={isFrozen}
        onChange={(event) => onNoteChange(event.target.value.slice(0, MAX_NOTE_CHARS))}
        onKeyDown={(event) => {
          // Enter sends, as in the chat's own input; Shift+Enter is a new line.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            send()
          }
        }}
        placeholder={placeholder}
        helperText={helperText}
        inputProps={{'aria-label': 'Feedback note'}}
      />
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
        {screenshot ? (
          // An attachment, as a chat composer shows an attached image: a
          // thumbnail card with its remove badge on the corner.
          <Box data-testid='Feedback-Screenshot' sx={{position: 'relative', flexShrink: 0}}>
            <Box
              component='img'
              src={screenshot}
              alt='Screenshot of the view'
              sx={{
                display: 'block',
                height: 48,
                maxWidth: 96,
                objectFit: 'cover',
                borderRadius: `${theme.shape.borderRadius}px`,
                border: `1px solid ${theme.palette.divider}`,
              }}
            />
            {!isFrozen && (
              <IconButton
                size='small'
                aria-label='Remove screenshot'
                title='Remove screenshot'
                onClick={() => onScreenshotChange(null)}
                data-testid='Feedback-ScreenshotRemove'
                sx={{
                  'position': 'absolute',
                  'top': -8,
                  'right': -8,
                  'p': 0.25,
                  'fontSize': '0.85rem',
                  'backgroundColor': theme.palette.background.paper,
                  'border': `1px solid ${theme.palette.divider}`,
                  '&:hover': {backgroundColor: theme.palette.background.paper},
                }}
              >
                <CloseIcon fontSize='inherit'/>
              </IconButton>
            )}
          </Box>
        ) : (
          <Tooltip title='Attach screenshot'>
            <span>
              <IconButton
                size='small'
                aria-label='Attach screenshot'
                onClick={() => void attach()}
                disabled={isFrozen || isCapturing}
                data-testid='Feedback-AttachScreenshot'
              >
                <AttachScreenshotIcon fontSize='small'/>
              </IconButton>
            </span>
          </Tooltip>
        )}
        <Box sx={{flex: 1, minWidth: 0}}>
          {shownHint && (
            <Typography variant='caption' color='text.secondary' role='status' data-testid='Feedback-Hint'>
              {shownHint}
            </Typography>
          )}
        </Box>
        <Button size='small' onClick={onCancel} disabled={isSending} data-testid='Feedback-Cancel'
          sx={{textTransform: 'none'}}
        >
          Cancel
        </Button>
        <Button
          size='small'
          type='submit'
          variant='contained'
          color='accent'
          disabled={!canSend}
          data-testid='Feedback-Send'
          sx={{textTransform: 'none'}}
        >
          Send
        </Button>
      </Box>
    </Box>
  )
}
