import React from 'react'
import {render} from '@testing-library/react'
import ControlsGroup from './ControlsGroup'
// import useStore from '../store/useStore'
import ShareMock from '../ShareMock'


describe('Controls group', () => {
  it('Tree Icon is present', () => {
    const modelPath = {
      filepath: `/index.ifc`,
      repo: 'bldrs-ai',
    }
    const {getByTitle} = render(<ShareMock><ControlsGroup modelPath={modelPath}/></ShareMock>)
    const treeButton = getByTitle('Structure')
    expect(treeButton).toBeInTheDocument()
  })
  // it('Branches Icon is present', async () => {
  //   const {result} = renderHook(() => useStore((state) => state))
  //   await act(() => {
  //     result.current.setIsBranches(true)
  //   })
  //   const modelPath = {
  //     filepath: `/index.ifc`,
  //     repo: 'bldrs-ai',
  //   }
  //   const {getByTitle} = render(<ShareMock><ControlsGroup modelPath={modelPath}/></ShareMock>)
  //   const branchesButton = getByTitle('Versions')
  //   expect(branchesButton).toBeInTheDocument()
  // })
})
