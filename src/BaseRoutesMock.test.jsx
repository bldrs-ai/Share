import React from 'react'
import {MemoryRouter, Routes, Route} from 'react-router-dom'
import {render} from '@testing-library/react'


jest.mock('three')


test('mockRoutes', () => {
  const testLabel = 'Test node label'
  const {getByText} = render(<MockRoutes contentElt={testLabel}/>)
  expect(getByText(testLabel)).toBeInTheDocument()
})


/**
 * @param {Array} initialEntries For react-router MemoryRouter.
 * @param {object} contentElt React component for Route.
 * @return {React.Component} React component
 */
export default function MockRoutes({initialEntries = ['/'], contentElt} = {}) {
  // TODO(pablo): would be better to not include the initialEntries
  // attribute if not given, but don't know how to do this in React,
  // so setting the default as defined in
  // https://reactrouter.com/docs/en/v6/routers/memory-router.
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/*" element={contentElt}/>
      </Routes>
    </MemoryRouter>
  )
}
