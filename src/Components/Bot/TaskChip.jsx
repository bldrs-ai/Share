import React, {ReactElement, useId, useState} from 'react'
import {Box, Button, CircularProgress, Typography, useTheme} from '@mui/material'
import {ChevronRight, ExpandMore} from '@mui/icons-material'
import {formatClock, formatDuration, formatFullTime} from './taskTimes'


/**
 * A bare button. Not MUI's ButtonBase, whose ripple state updates on mount:
 * the time buttons mount when a turn's last event lands, outside any act().
 *
 * @param {object} props `sx` and the button's own props
 * @return {ReactElement}
 */
function PlainButton({sx, ...props}) {
  return (
    <Box
      component='button'
      type='button'
      sx={{
        'font': 'inherit',
        'cursor': 'pointer',
        'background': 'none',
        'border': 0,
        'p': 0,
        'display': 'inline-flex',
        'alignItems': 'center',
        'borderRadius': 1,
        '&:focus-visible': {outline: (theme) => `2px solid ${theme.palette.primary.main}`},
        ...sx,
      }}
      {...props}
    />
  )
}


/**
 * A time as a button: the time of day, the full date-time with zone on
 * hover, and a click swaps one for the other in place. `suffix` rides along
 * in the same parentheses ("(10:01 AM, 1m 23s)") and is not part of the toggle.
 *
 * @property {number} ms epoch milliseconds
 * @property {string} [suffix] text after the time, inside the parentheses
 * @property {string} testId for the button
 * @return {ReactElement}
 */
function TimeButton({ms, suffix = '', testId}) {
  const theme = useTheme()
  const [isFull, setIsFull] = useState(false)
  const full = formatFullTime(ms)
  return (
    <PlainButton
      onClick={() => setIsFull((prev) => !prev)}
      title={full}
      data-testid={testId}
      sx={{
        // Half grey: the chip's own text is secondary, this is a step quieter.
        'color': theme.palette.text.disabled,
        ...theme.typography.caption,
        'textAlign': 'left',
        '&:hover, &:focus-visible': {color: theme.palette.text.secondary},
      }}
    >
      ({isFull ? full : formatClock(ms)}{suffix})
    </PlainButton>
  )
}


/**
 * One tool step's task chip for a whole assistant turn: the viewer actions
 * and reads it ran, in one line instead of a stack.
 *
 * Compact: the latest task (running or done), its Undo if it has one, and when the turn is
 * done, `(start, total duration)`. Expanded: the count and start time, every
 * task with its own duration, and the end time once the turn is done. The
 * list grows as the turn runs.
 *
 * Undo is the one the panel already decides (`undoTop`): it shows on the last
 * undoable task of the newest undoable step, so a step run before the latest
 * is reachable only expanded.
 *
 * @property {object} message a 'tasks' message (BotChat.jsx `applyEvent`)
 * @property {?string} undoTop the one step that offers Undo
 * @property {boolean} undoPending an undo is running
 * @property {Function} onUndo called with the step id
 * @return {ReactElement}
 */
export default function TaskChip({message, undoTop, undoPending, onUndo}) {
  const theme = useTheme()
  const listId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const {tasks, startedAt, endedAt} = message
  if (tasks.length === 0) {
    return null
  }
  const isDone = endedAt !== undefined
  const lastTask = tasks[tasks.length - 1]

  let undoIndex = -1
  tasks.forEach((task, i) => {
    if (task.stepId === undoTop && task.undoable) {
      undoIndex = i
    }
  })

  const row = (task, i, showDuration) => (
    <Box
      key={task.callId}
      data-testid='BotChat-Action'
      data-step-id={task.stepId}
      sx={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1, minWidth: 0}}
    >
      <Typography
        variant='caption'
        sx={{
          color: task.ok ? theme.palette.text.secondary : theme.palette.error.main,
          fontStyle: 'italic',
          overflowWrap: 'anywhere',
        }}
      >
        {task.line}
      </Typography>
      {task.running && <CircularProgress size={10} thickness={6} aria-hidden='true' data-testid='BotChat-TaskRunning'/>}
      {showDuration && !task.running && (
        <Typography variant='caption' sx={{color: theme.palette.text.disabled}} data-testid='BotChat-TaskDuration'>
          ({formatDuration(task.endedAt - task.startedAt)})
        </Typography>
      )}
      {i === undoIndex && !task.undone && (
        <Button
          size='small'
          variant='text'
          onClick={() => onUndo(task.stepId)}
          disabled={undoPending}
          aria-busy={undoPending}
          aria-label={`Undo: ${task.line}`}
          data-testid='BotChat-UndoButton'
          sx={{minWidth: 0, py: 0, textTransform: 'none'}}
        >
          {undoPending ? 'Undoing…' : 'Undo'}
        </Button>
      )}
      {task.undone && (
        <Typography variant='caption' sx={{color: theme.palette.text.secondary}} data-testid='BotChat-Undone'>
          {task.undoFailed ? 'Couldn\'t undo all of it' : 'Undone'}
        </Typography>
      )}
    </Box>
  )

  const expando = (
    <PlainButton
      onClick={() => setIsOpen((prev) => !prev)}
      aria-expanded={isOpen}
      aria-controls={listId}
      aria-label='Steps'
      data-testid='BotChat-TasksToggle'
      sx={{color: theme.palette.text.secondary}}
    >
      {isOpen ? <ExpandMore fontSize='inherit'/> : <ChevronRight fontSize='inherit'/>}
    </PlainButton>
  )

  return (
    <Box
      data-testid='BotChat-Tasks'
      sx={{
        alignSelf: 'flex-start',
        maxWidth: '100%',
        minWidth: 0,
        px: 1,
        py: 0.25,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: `${theme.shape.borderRadius}px`,
      }}
    >
      {isOpen ? (
        <>
          <Box sx={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1}}>
            <Typography variant='caption' sx={{color: theme.palette.text.secondary}} data-testid='BotChat-TasksCount'>
              {tasks.length} {tasks.length === 1 ? 'command' : 'commands'}
            </Typography>
            {expando}
            <TimeButton ms={startedAt} testId='BotChat-TasksStart'/>
          </Box>
          <Box id={listId} sx={{display: 'flex', flexDirection: 'column', pl: 1}}>
            {tasks.map((task, i) => row(task, i, true))}
          </Box>
          {isDone && <TimeButton ms={endedAt} testId='BotChat-TasksEnd'/>}
        </>
      ) : (
        <Box id={listId} sx={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1}}>
          {row(lastTask, tasks.length - 1, false)}
          {expando}
          {isDone && <TimeButton ms={startedAt} suffix={`, ${formatDuration(endedAt - startedAt)}`} testId='BotChat-TasksStart'/>}
        </Box>
      )}
    </Box>
  )
}
