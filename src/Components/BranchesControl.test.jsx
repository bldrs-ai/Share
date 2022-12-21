import React from 'react'
import {act, render, renderHook, waitFor, screen} from '@testing-library/react'
import {rest} from 'msw'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import {server} from '../__mocks__/server'
import {
  MOCK_BRANCHES,
  MOCK_ONE_BRANCH,
  MOCK_MODEL_PATH_GIT,
  MOCK_MODEL_PATH_LOCAL,
} from '../utils/GitHub'
import BranchesControl from './BranchesControl'


describe('BranchControl', () => {
  beforeEach(() => {
    const httpOk = 200
    server.use(
        rest.get('https://api.github.com/repos/:org/:repo/branches', (req, res, ctx) => {
          return res(
              ctx.status(httpOk),
              ctx.json(MOCK_BRANCHES.data),
          )
        }),
    )
  })

  it('show the component when there are more than two branches', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModelPath(MOCK_MODEL_PATH_GIT)
    })
    const {getByText} = render(<ShareMock><BranchesControl/></ShareMock>)
    await waitFor(() => {
      expect(getByText('main')).toBeInTheDocument()
    })
  })

  it('do not show the component if the model is not loaded from github', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModelPath(MOCK_MODEL_PATH_LOCAL)
    })
    render(<ShareMock><BranchesControl/></ShareMock>)
    const branchDropDown = screen.queryByText('Git Branches / Project Versions')
    await waitFor(() => {
      expect(branchDropDown).toBeNull()
    })
  })

  it('do not show the component when there is only one branch', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setModelPath(MOCK_MODEL_PATH_GIT)
    })
    render(<ShareMock><BranchesControl/></ShareMock>)
    server.use(
        rest.get('https://api.github.com/repos/:org/:repo/branches', (req, res, ctx) => {
          return res(
              ctx.json(MOCK_ONE_BRANCH),
          )
        }),
    )
    const branchDropDown = screen.queryByText('Git Branches / Project Versions')
    await waitFor(() => {
      expect(branchDropDown).toBeNull()
    })
  })
})

