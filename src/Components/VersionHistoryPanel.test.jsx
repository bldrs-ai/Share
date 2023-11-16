import React from 'react'
import ShareMock from '../ShareMock'
import {render} from '@testing-library/react'
// import VersionHistoryPanel from './VersionHistoryPanel'


jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}))

jest.mock('../utils/GitHub', () => ({
  getCommitsForBranch: jest.fn(),
}))

describe('VersionsHistoryPanel', () => {
  it('Version history is rendered', () => {
    render(
        <ShareMock/>,
    )
  })
})
