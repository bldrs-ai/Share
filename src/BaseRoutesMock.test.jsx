import React from 'react'
import {render} from '@testing-library/react'
import {MemoryRouter, Routes, Route} from 'react-router-dom'


test('mockRoutes', () => {
  const testLabel = 'Test node label'
  const {getByText} = render(mockRoutes(
      <>{testLabel}</>,
  ))
  expect(getByText(testLabel)).toBeInTheDocument()
})


export const mockRoutes = (contentElt) => {
  return (
    <MemoryRouter>
      <Routes>
        <Route path="/*" element={contentElt} />
      </Routes>
    </MemoryRouter>
  )
}
