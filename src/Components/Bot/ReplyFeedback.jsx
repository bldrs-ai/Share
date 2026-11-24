import React, {ReactElement, useState, useSyncExternalStore} from 'react'
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
import {
  RATINGS,
  abandonUnsentRating,
  isReplyPosting,
  rateReply,
  replyFeedbackPosts,
  retryOf,
  runReplyPost,
  setRetry,
} from './assistFeedback'


export const NOTE_PLACEHOLDER = 'Add a note (optional): what was right or wrong?'
export const NOTE_HELPER_TEXT = 'This reply, your message before it, your note, the view and any screenshot ' +
  'are shared with Bldrs to improve the assistant.'
export const SEND_FAILED_TEXT = 'Couldn\'t send. Try again.'
export const SENT_TEXT = 'Thanks for the feedback'

/** The class the reply group reveals on hover or focus (BotChat.jsx `REPLY_GROUP_SX`). */
export const FEEDBACK_CLASS = 'BotChat-Feedback'

// Each note area a thumb opens is its own draft, by id.
let draftSeq = 0

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
 *   same record again. The record is also kept at module scope, so after the
 *   panel is closed and reopened the reply still offers "Try again" for it,
 *   and its filled thumb takes the unsent rating back without posting. A failed clear offers "Try again", which posts the
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
  // Every post for a reply runs alone, and the thumbs are disabled while one
  // is in flight: a rating, a clear, or a retry. That state, and a failed
  // post's record, live in assistFeedback.js#replyFeedbackPosts, not here, so
  // a panel closed and reopened mid-post, or after a failure, still holds
  // them.
  const posts = useSyncExternalStore(replyFeedbackPosts.subscribe, replyFeedbackPosts.get)
  const isPosting = isReplyPosting(posts, message.id)
  // A rating or clear whose post failed: it already shows on the reply and is
  // counted in GA, so "Try again" posts this same record rather than making
  // the user act again (more events).
  const retry = retryOf(posts, message.id)
  const shown = draft?.rating ?? sent
  const isSending = draft?.status === 'sending'
  // A failed post says so wherever the panel is reopened.
  const shownHint = hint ?? (retry ? SEND_FAILED_TEXT : null)

  const choose = (rating) => {
    setHint(null)
    if (!draft && rating === sent && retry && retry.rating === rating) {
      // The filled thumb of a rating that never reached the store: take it
      // back here. A `none` would retract a rating the store never got.
      abandonUnsentRating(message.id)
      return
    }
    // A newer rating supersedes a failed post: retrying it later would
    // undo the rating the reply then shows.
    setRetry(message.id, null)
    if (draft) {
      // A thumb while the note is open: the same one cancels, the other switches.
      setDraft(rating === draft.rating || draft.record ? null : {...draft, rating})
      return
    }
    if (rating === sent) {
      void clear()
      return
    }
    setDraft({id: ++draftSeq, rating, note: '', screenshot: null, status: 'editing', record: null})
  }

  const clear = async () => {
    const replyId = message.id
    const {ok, record} = await runReplyPost(replyId, () => rateReply({replyId, rating: RATINGS.NONE}))
    setRetry(replyId, ok ? null : record)
    setHint(null)
  }

  const retryPost = async () => {
    const replyId = message.id
    if (!retry || isPosting) {
      return
    }
    const ok = await runReplyPost(replyId, () => postFeedback(retry))
    setRetry(replyId, ok ? null : retry)
    setHint(ok ? SENT_TEXT : null)
  }

  const send = async () => {
    if (!draft || isSending) {
      return
    }
    setDraft({...draft, status: 'sending'})
    let ok
    let record = draft.record
    if (record) {
      ok = await runReplyPost(message.id, () => postFeedback(record))
    } else {
      ({ok, record} = await runReplyPost(message.id, () => rateReply({replyId: message.id, rating: draft.rating,
        note: draft.note, screenshot: draft.screenshot})))
    }
    // The failed record is kept at module scope too, so closing the panel
    // doesn't lose it: a remount offers "Try again" for it.
    setRetry(message.id, ok ? null : record)
    if (ok || !record) {
      setDraft(null)
      setHint(ok ? SENT_TEXT : null)
    } else {
      setDraft({...draft, status: 'failed', record})
      setHint(SEND_FAILED_TEXT)
    }
  }

  const isActive = draft !== null || sent !== null || shownHint !== null
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
            disabled={isPosting || isSending || Boolean(draft?.record && rating !== shown)}
            data-testid={testId}
          >
            {shown === rating ? <On fontSize='inherit'/> : <Off fontSize='inherit'/>}
          </IconButton>
        ))}
        {shownHint && !draft && (
          <Typography variant='caption' color='text.secondary' role='status' data-testid='BotChat-FeedbackHint'>
            {shownHint}
          </Typography>
        )}
        {retry && !draft && (
          <Button
            size='small'
            onClick={() => void retryPost()}
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
          // Only into the draft that asked for it: a capture that outlives
          // its draft (cancelled, then a new one opened) changes nothing.
          onScreenshotChange={((draftId) => (screenshot) => setDraft((d) => (d?.id === draftId ? {...d, screenshot} : d)))(draft.id)}
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
