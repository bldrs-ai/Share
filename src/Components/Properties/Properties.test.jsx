import React from 'react'
import {act, render, screen, waitFor, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import {MockModel} from '../../utils/IfcMock.test'
import useStore from '../../store/useStore'
import Properties from './Properties'


test('Properties for single element', async () => {
  const testLabel = 10
  const {result} = renderHook(() => useStore((state) => state))
  await act(() => {
    result.current.setSelectedElement({expressID: 10})
    result.current.setModel(new MockModel)
  })

  const {getByText} = render(
    <ShareMock>
      <Properties/>
    </ShareMock>)
  await waitFor(() => screen.getByText(testLabel))
  expect(getByText(testLabel)).toBeInTheDocument()
})


/**
 * The panel awaits the engine for every selection, and an earlier selection's
 * answer can arrive AFTER a later one's: a deep container's read takes longer,
 * and under ?feature=engineWorker each read is a round trip to the worker, so
 * clicking down the NavTree while it loads queues them up. The late answer
 * must not replace what is on screen for the current selection.
 */
test('a slow answer for an earlier selection does not overwrite the current one', async () => {
  let releaseFirst
  const firstHeld = new Promise((resolve) => {
    releaseFirst = resolve
  })
  const lines = {
    1: {expressID: 1, Name: {type: 1, value: 'Earlier selection'}},
    2: {expressID: 2, Name: {type: 1, value: 'Current selection'}},
  }
  const model = {
    getItemProperties: async (id) => {
      if (id === 1) {
        await firstHeld
      }
      return structuredClone(lines[id])
    },
    getPropertySets: () => Promise.resolve([]),
  }
  const {result} = renderHook(() => useStore((state) => state))
  await act(() => {
    result.current.setModel(model)
    result.current.setSelectedElement({expressID: 1})
  })
  render(
    <ShareMock>
      <Properties/>
    </ShareMock>)
  await act(() => {
    result.current.setSelectedElement({expressID: 2})
  })
  expect(await screen.findByText('Current selection')).toBeInTheDocument()
  await act(async () => {
    releaseFirst()
    await firstHeld
  })
  // Let the released read finish building its (discarded) table.
  const SETTLE_MS = 50
  await act(() => new Promise((resolve) => setTimeout(resolve, SETTLE_MS)))
  expect(screen.getByText('Current selection')).toBeInTheDocument()
  expect(screen.queryByText('Earlier selection')).not.toBeInTheDocument()
})


// TODO(pablo):
/*
test('Properties for testObj', async () => {
  const testLabel = 'Test node label'
  const {getByText} = render(mockRoutes(
      <Properties
        model={new MockModel}
        element={testObj} />,
  ))
  await waitFor(() => screen.getByText(testLabel))
  expect(getByText(testLabel)).toBeInTheDocument()
})
*/
