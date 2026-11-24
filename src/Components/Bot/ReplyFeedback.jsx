import React, {ReactElement, useState} from 'react'
import {Box, Button, IconButton, Typography} from '@mui/material'
import {
  ThumbDown as ThumbDownIcon,
  ThumbDownOutlined as ThumbDownOutlinedIcon,
  ThumbUp as ThumbUpIcon,
  ThumbUpOutlined as ThumbUpOutlinedIcon,
} from '@mui/icons-material'
import FeedbackNote from '../../feedback/FeedbackNote'
import {FEEDBACK_SOURCES} from '../../feedback/feedbackRecord'
import {postFeedback} from '../../feedback/submitFeedback'
import {RATINGS, rateReply} from './assistFeedback'


export const NOTE_PLACEHOLDER = 'Add a note (optional): what was right or wrong?'
export const NOTE_HELPER_TEXT = 'This reply, your message before it, your note, the view and any screenshot ' +
  'are shared with Bldrs to improve the assistant.'
export const SEND_FAILED_TEXT = 'Couldn\'t send. Try again.'
export const SENT_TEXT = 'Thanks for the feedback'

/** The class the reply group reveals on hover or focus (BotChat.jsx `REPLY_GROUP_SX`). */
export const FEEDBACK_CLASS = 'BotChat-Feedback'

const THUMBS = [
  {rating: RATINGS.UP, label: 'Good reply', On: ThumbUpIcon, Off: ThumbUpOutlinedIcon, testId: 'BotChat-ThumbUp'},
  {rating: RATINGS.DOWN, label: 'Bad reply', On: ThumbDownIcon, Off: ThumbDownOutlinedIcon,
    testId: 'BotChat-ThumbDown'},
]


/**
 * Thumbs up and down under an assistant reply, and the note area a choice
 * opens (Share#2306). The assistant's entry point to the feedback module
 * (design/new/feedback.md): the thumbs are this file's, the note area with
 * its opt-in screenshot is the module's FeedbackNote, and assistFeedback.js
 * says what the rating is about.
 *
 * - Choosing a thumb fills it and opens the note. Send rates the reply, with
 *   a note and a screenshot or without; Cancel goes back to what was rated.
 * - Choosing the other thumb later rates again, a new rating, and choosing
 *   the filled one with no note open clears it: each change is one event.
 * - A failed post keeps the note open with a quiet hint; Send tries the
 *   same record again. A failed clear offers "Try again", which posts the
 *   same clear record; a newer rating drops it.
 * - One post at a time per reply: the thumbs are disabled while a rating or
 *   a clear is in flight, so the store's latest record is the one shown.
 *
 * The thumbs are hidden until the reply is hovered or focused, and always
 * shown on touch screens and in the phone layout, where there is no hover
 * (BotChat.jsx `REPLY_GROUP_SX`). While a rating stands or the note is open
 * they stay shown, so the filled icon is always visible.
 *
 * @property {object} message the rated assistant bubble; its `rating` is what was last sent
 * @property {boolean} alwaysShown the phone layout
 * @return {ReactElement}
 */
export default function ReplyFeedback({message, alwaysShown = false}) {
  const sent = message.rating ?? null
  // `{rating, note, screenshot, status, record}` while the note is open, else
  // null. `record` is the one already sent to GA, kept for a retry after a
  // failed post.
  const [draft, setDraft] = useState(null)
  const [hint, setHint] = useState(null)
  // A clear whose post failed: the rating is already cleared on the reply
  // and counted in GA, so "Try again" posts this same record rather than
  // making the user re-rate and clear again (two more events; Codex on #2313).
  const [clearRetry, setClearRetry] = useState(null)
  const [isRetryingClear, setIsRetryingClear] = useState(false)
  // A clear in flight. The rating is already cleared on the reply, but its
  // post hasn't landed: a new rating sent now could reach the store first,
  // and the slower clear would then stand as the latest record while the
  // reply shows the new rating (Codex on #2313). So every post for a reply
  // runs alone: the thumbs are disabled while a clear, a retry of one, or a
  // rating is in flight.
  const [isClearing, setIsClearing] = useState(false)
  const shown = draft?.rating ?? sent
  const isSending = draft?.status === 'sending'
  const isPosting = isSending || isClearing || isRetryingClear

  const choose = (rating) => {
    setHint(null)
    setClearRetry(null)
    if (draft) {
      // A thumb while the note is open: the same one cancels, the other switches.
      setDraft(rating === draft.rating || draft.record ? null : {...draft, rating})
      return
    }
    if (rating === sent) {
      void clear()
      return
    }
    setDraft({rating, note: '', screenshot: null, status: 'editing', record: null})
  }

  const clear = async () => {
    setIsClearing(true)
    try {
      const {ok, record} = await rateReply({replyId: message.id, rating: RATINGS.NONE})
      setHint(ok ? null : SEND_FAILED_TEXT)
      setClearRetry(ok ? null : record)
    } finally {
      setIsClearing(false)
    }
  }

  const retryClear = async () => {
    if (!clearRetry || isRetryingClear) {
      return
    }
    setIsRetryingClear(true)
    let ok = false
    try {
      ok = await postFeedback(clearRetry)
    } finally {
      setIsRetryingClear(false)
    }
    setHint(ok ? SENT_TEXT : SEND_FAILED_TEXT)
    setClearRetry(ok ? null : clearRetry)
  }

  const send = async () => {
    if (!draft || isSending) {
      return
    }
    setDraft({...draft, status: 'sending'})
    let ok
    let record = draft.record
    if (record) {
      ok = await postFeedback(record)
    } else {
      ({ok, record} = await rateReply({replyId: message.id, rating: draft.rating, note: draft.note,
        screenshot: draft.screenshot}))
    }
    if (ok || !record) {
      setDraft(null)
      setHint(ok ? SENT_TEXT : null)
    } else {
      setDraft({...draft, status: 'failed', record})
      setHint(SEND_FAILED_TEXT)
    }
  }

  const isActive = draft !== null || sent !== null || hint !== null
  return (
    <Box
      className={FEEDBACK_CLASS}
      data-testid='BotChat-Feedback'
      data-always-shown={alwaysShown || isActive ? 'true' : 'false'}
      sx={{display: 'flex', flexDirection: 'column', gap: 0.5}}
    >
      <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
        {THUMBS.map(({rating, label, On, Off, testId}) => (
          <IconButton
            key={rating}
            size='small'
            aria-label={label}
            title={label}
            aria-pressed={shown === rating}
            onClick={() => choose(rating)}
            disabled={isPosting || Boolean(draft?.record && rating !== shown)}
            data-testid={testId}
          >
            {shown === rating ? <On fontSize='inherit'/> : <Off fontSize='inherit'/>}
          </IconButton>
        ))}
        {hint && !draft && (
          <Typography variant='caption' color='text.secondary' role='status' data-testid='BotChat-FeedbackHint'>
            {hint}
          </Typography>
        )}
        {clearRetry && !draft && (
          <Button
            size='small'
            onClick={() => void retryClear()}
            disabled={isPosting}
            data-testid='BotChat-FeedbackRetry'
            sx={{textTransform: 'none'}}
          >
            Try again
          </Button>
        )}
      </Box>
      {draft && (
        <FeedbackNote
          source={FEEDBACK_SOURCES.ASSIST_REPLY}
          note={draft.note}
          onNoteChange={(note) => setDraft((d) => ({...d, note}))}
          screenshot={draft.screenshot}
          onScreenshotChange={(screenshot) => setDraft((d) => (d ? {...d, screenshot} : d))}
          onSend={() => void send()}
          onCancel={() => {
            setDraft(null)
            setHint(null)
          }}
          placeholder={NOTE_PLACEHOLDER}
          helperText={NOTE_HELPER_TEXT}
          isSending={isSending}
          isLocked={draft.record !== null}
          hint={hint}
        />
      )}
    </Box>
  )
}
