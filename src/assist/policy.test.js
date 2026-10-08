import {policyFor} from './policy'


describe('assist/policy', () => {
  // The whole table: every annotation alone, plus the precedence cases a
  // provider could write by accident.
  it.each([
    ['unannotated', undefined, 'confirm'],
    ['empty annotations', {}, 'confirm'],
    ['readOnly', {readOnly: true}, 'run'],
    ['viewState', {viewState: true}, 'runWithUndo'],
    ['mutatesDocument', {mutatesDocument: true}, 'confirm'],
    ['external', {external: true}, 'confirm'],
    ['sendsPixels', {sendsPixels: true}, 'confirm'],
    ['readOnly + viewState', {readOnly: true, viewState: true}, 'runWithUndo'],
    ['readOnly + external', {readOnly: true, external: true}, 'confirm'],
    ['viewState + mutatesDocument', {viewState: true, mutatesDocument: true}, 'confirm'],
    ['readOnly + sendsPixels', {readOnly: true, sendsPixels: true}, 'confirm'],
    ['explicit false flags', {readOnly: false, viewState: false}, 'confirm'],
  ])('%s → %s', (_label, annotations, expected) => {
    expect(policyFor(annotations)).toBe(expected)
  })
})
