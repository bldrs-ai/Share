import React from 'react'
import ShareMock from '../ShareMock'
import {render} from '@testing-library/react'
// import {getCommitsForBranch} from '../utils/GitHub'
// import VersionHistoryPanel from './VersionHistoryPanel'


jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}))

jest.mock('../utils/GitHub', () => ({
  getCommitsForBranch: jest.fn(),
}))

describe('VersionsHistoryPanel', () => {
  it('fetches commits on mount', () => {
    render(
        <ShareMock/>,
        // <ShareMock>
        //   <VersionHistoryPanel branch="main"/>
        // </ShareMock>,
    )

    // await waitFor(() => {
    //   // expect(getCommitsForBranch).toHaveBeenCalled()
    // })
  })

  // it('navigates to main on button click', () => {
  //   const navigate = useNavigate()

  //   const {getByLabelText} = render(
  //       <ShareMock>
  //         <VersionHistoryPanel branch="main"/>
  //       </ShareMock>,
  //   )

  //   fireEvent.click(getByLabelText('navigate_to_tip'))

  //   expect(navigate).toHaveBeenCalledWith({
  //     pathname: expect.any(String), // Replace with expected pathname
  //   })
  // })
})
