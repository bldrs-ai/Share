import React from 'react'
import {act, render, screen} from '@testing-library/react'
import useStore from '../../store/useStore'
import {ThemeCtx} from '../../theme/Theme.fixture'
import {registerSelectionFunnel} from '../../viewer/tools/selectionFunnel'
import {loadFixture, makeStoreFunnel} from '../../viewer/tools/tools.fixture'
import RefChip from './RefChip'


jest.mock('../../viewer/ShareViewer', () => ({}))
jest.mock('postprocessing', () => ({BlendFunction: {SCREEN: 1}}))


describe('Components/Bot/RefChip', () => {
  let unregister

  beforeEach(async () => {
    await loadFixture()
    unregister = registerSelectionFunnel(makeStoreFunnel())
  })

  afterEach(() => {
    unregister()
  })

  // CadView stores the model and tree before the isolator has taken the model
  // (scene-graph name paths wait on it) and raises isModelReady after. A chip
  // rendered in that window must enable once it flips, not stay disabled.
  it('is disabled while the model is not ready, and enables when it becomes ready', () => {
    useStore.setState({isModelReady: false})
    render(<RefChip refText='e102'>Window 1</RefChip>, {wrapper: ThemeCtx})
    expect(screen.getByTestId('BotChat-RefChip-Disabled')).toBeInTheDocument()
    act(() => {
      useStore.setState({isModelReady: true})
    })
    expect(screen.getByTestId('BotChat-RefChip')).toHaveAttribute('href', expect.stringContaining('#sel:e102'))
  })
})
