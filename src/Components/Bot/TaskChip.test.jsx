/* eslint-disable no-magic-numbers */
import React from 'react'
import {fireEvent, render, screen, within} from '@testing-library/react'
import {ThemeCtx} from '../../theme/Theme.fixture'
import {applyEvent} from './BotChat'
import TaskChip from './TaskChip'
import {formatFullTime} from './taskTimes'


// 2026-11-19 18:01:05 UTC.
const T0 = Date.UTC(2026, 10, 19, 18, 1, 5)
const SECOND = 1000
const at = (seconds) => T0 + (seconds * SECOND)
const call = (callId, stepId = '1.0') => ({type: 'tool-call', stepId, callId, name: 'model.query', input: {}})
const result = (callId, echo, extra = {}) =>
  ({type: 'tool-result', stepId: '1.0', callId, name: 'model.query', ok: true, undoable: false, echo, ...extra})


/**
 * A turn's events at fixed times, folded as the panel does.
 *
 * @param {Array<[object, number]>} timed events with the clock at each
 * @return {Array<object>} the messages
 */
function fold(timed) {
  return timed.reduce((messages, [event, now]) => applyEvent(messages, event, 'turn-1', 'OpenRouter',
    {now, turnStartedAt: T0}), [])
}


describe('applyEvent: the task chip\'s record', () => {
  it('starts a task at its tool-call and ends it at its tool-result, in one chip for the turn', () => {
    const messages = fold([
      [call('a'), at(2)],
      [result('a', 'Read the spatial structure'), at(72)],
      [call('b'), at(72)],
      [result('b', 'Found 10 elements'), at(75)],
    ])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({kind: 'tasks', turn: 'turn-1', startedAt: T0})
    expect(messages[0].endedAt).toBeUndefined()
    expect(messages[0].tasks.map(({line, startedAt, endedAt}) => [line, startedAt, endedAt])).toEqual([
      ['Read the spatial structure', at(2), at(72)],
      ['Found 10 elements', at(72), at(75)],
    ])
  })

  it('adds a task as running at its tool-call, and the result turns it into the echo', () => {
    const running = fold([[call('a'), at(2)]])
    expect(running[0].tasks).toEqual([expect.objectContaining({line: 'Finding elements…', running: true, startedAt: at(2)})])
    const done = applyEvent(running, result('a', 'Found 10 elements'), 'turn-1', 'OpenRouter', {now: at(5)})
    expect(done[0].tasks).toHaveLength(1)
    expect(done[0].tasks[0]).toMatchObject({line: 'Found 10 elements', running: false, startedAt: at(2), endedAt: at(5)})
  })

  it('names an unlisted tool generically while it runs', () => {
    const [chip] = fold([[{...call('a'), name: 'x.thing'}, T0]])
    expect(chip.tasks[0].line).toBe('Running x.thing…')
  })

  it('keeps the chip where its first task landed, and adds later tasks to it after text', () => {
    const messages = fold([
      [result('a', 'first'), at(1)],
      [{type: 'text-delta', stepId: '1.1', text: 'Now selecting.'}, at(2)],
      [result('b', 'second'), at(3)],
    ])
    expect(messages.map((m) => m.kind)).toEqual(['tasks', 'assistant'])
    expect(messages[0].tasks.map((t) => t.line)).toEqual(['first', 'second'])
  })

  it('words a failed task as before, and marks it not ok', () => {
    const [chip] = fold([[result('a', undefined, {ok: false, error: {code: 'boom', message: 'x'}}), T0]])
    expect(chip.tasks[0]).toMatchObject({line: 'model.query failed', ok: false})
  })
})


describe('TaskChip, while a task runs', () => {
  it('shows the running label and a progress mark, with no duration', () => {
    const message = fold([[call('a'), at(1)]])[0]
    render(<TaskChip message={message} undoTop={null} undoPending={false} onUndo={jest.fn()}/>, {wrapper: ThemeCtx})
    expect(screen.getByText('Finding elements…')).toBeInTheDocument()
    expect(screen.getByTestId('BotChat-TaskRunning')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', {name: 'Steps'}))
    expect(screen.getByTestId('BotChat-TasksCount')).toHaveTextContent('1 command')
    expect(screen.queryByTestId('BotChat-TaskDuration')).toBeNull()
  })
})


describe('TaskChip', () => {
  const finished = (extra = {}) => ({
    ...fold([
      [call('a'), T0],
      [result('a', 'Read the spatial structure'), at(70)],
      [call('b', '1.1'), at(70)],
      [result('b', 'Selected 1 element', {stepId: '1.1', undoable: true}), at(70) + 500],
    ])[0],
    ...extra,
  })

  /**
   * @param {object} message the chip's message
   * @param {object} [props] more props
   * @return {object} onUndo, to see what was asked
   */
  function renderChip(message, props = {}) {
    const onUndo = jest.fn()
    render(<TaskChip message={message} undoTop='1.1' undoPending={false} onUndo={onUndo} {...props}/>,
      {wrapper: ThemeCtx})
    return {onUndo}
  }

  it('compact: only the latest task, its Undo, and no times while the turn runs', () => {
    const {onUndo} = renderChip(finished())
    expect(screen.getAllByTestId('BotChat-Action')).toHaveLength(1)
    expect(screen.getByText('Selected 1 element')).toBeInTheDocument()
    expect(screen.queryByText('Read the spatial structure')).toBeNull()
    expect(screen.queryByTestId('BotChat-TasksStart')).toBeNull()
    fireEvent.click(screen.getByRole('button', {name: 'Undo: Selected 1 element'}))
    expect(onUndo).toHaveBeenCalledWith('1.1')
  })

  it('compact: an intermediate step\'s Undo is not offered when the last task has none', () => {
    renderChip(finished(), {undoTop: '1.0'})
    expect(screen.queryByTestId('BotChat-UndoButton')).toBeNull()
  })

  it('expanded: every task with its duration, the count, and the start; the end once done', () => {
    renderChip(finished({endedAt: at(71)}))
    const toggle = screen.getByRole('button', {name: 'Steps'})
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('BotChat-TasksCount')).toHaveTextContent('2 commands')
    const rows = screen.getAllByTestId('BotChat-Action')
    expect(rows.map((r) => r.textContent)).toEqual(['Read the spatial structure(1m 10s)', 'Selected 1 element(1s)Undo'])
    expect(screen.getByTestId('BotChat-TasksStart')).toBeInTheDocument()
    expect(screen.getByTestId('BotChat-TasksEnd').getAttribute('title')).toBe(formatFullTime(at(71)))
  })

  it('compact once done: start time and the whole turn\'s duration; a click shows the full time', () => {
    renderChip(finished({endedAt: at(83)}))
    const start = screen.getByTestId('BotChat-TasksStart')
    expect(start).toHaveTextContent(/, 1m 23s\)$/)
    expect(start.getAttribute('title')).toBe(formatFullTime(T0))
    fireEvent.click(start)
    expect(start.textContent).toBe(`(${formatFullTime(T0)}, 1m 23s)`)
    fireEvent.click(start)
    expect(start.textContent).not.toContain(formatFullTime(T0))
  })

  it('shows a failed task as failed, in the same words, in the chip', () => {
    renderChip(fold([[result('a', undefined, {ok: false}), T0]])[0], {undoTop: null})
    expect(within(screen.getByTestId('BotChat-Tasks')).getByText('model.query failed')).toBeInTheDocument()
  })
})
