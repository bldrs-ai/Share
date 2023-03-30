import React from 'react'
import {act, render, renderHook} from '@testing-library/react'
import ControlsGroup from './ControlsGroup'
import useStore from '../store/useStore'
import ShareMock from '../ShareMock'


describe('Controls group', () => {
  it('Tree Icon is present', () => {
    const modelPath = {
      filepath: `/index.ifc`,
      repo: 'bldrs-ai',
    }
    const {getByTitle} = render(<ShareMock><ControlsGroup modelPath={modelPath}/></ShareMock>)
    const treeButton = getByTitle('Hierarchy of spatial elements')
    expect(treeButton).toBeInTheDocument()
  })
  it('Branches Icon is present', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setIsBranches(true)
    })
    const modelPath = {
      filepath: `/index.ifc`,
      repo: 'bldrs-ai',
    }
    const {getByTitle} = render(<ShareMock><ControlsGroup modelPath={modelPath}/></ShareMock>)
    const branchesButton = getByTitle('Project Version')
    expect(branchesButton).toBeInTheDocument()
  })
})
