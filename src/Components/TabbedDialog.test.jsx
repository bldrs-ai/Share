import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import TabbedDialog from './TabbedDialog'


describe('TabbedDialog', () => {
  it('', () => {
    const cb1 = jest.fn()
    const cb2 = jest.fn()
    const cb3 = jest.fn()
    render(
        <TabbedDialog
          tabLabels={['Explore', 'Open', 'Save']}
          headerLabels={['Explore Sample Projects', 'Open Project', 'Save Project']}
          contentComponents={[
            (<p key='1'>{'A content'}</p>),
            (<p key='2'>{'B content'}</p>),
            (<p key='3'>{'C content'}</p>),
          ]}
          actionCbs={[cb1, cb2, cb3]}
          actionButtonLabels={['A OK', 'B OK', 'C OK']}
          isDialogDisplayed={true}
          setIsDialogDisplayed={jest.fn()}
        />)

    fireEvent.click(screen.getByText('A OK'))
    expect(cb1.mock.calls.length).toBe(1)
    expect(cb2.mock.calls.length).toBe(0)
    expect(cb3.mock.calls.length).toBe(0)

    fireEvent.click(screen.getByText('Open'))
    fireEvent.click(screen.getByText('B OK'))
    expect(cb1.mock.calls.length).toBe(1)
    expect(cb2.mock.calls.length).toBe(1)
    expect(cb3.mock.calls.length).toBe(0)

    fireEvent.click(screen.getByText('Save'))
    fireEvent.click(screen.getByText('C OK'))
    expect(cb1.mock.calls.length).toBe(1)
    expect(cb2.mock.calls.length).toBe(1)
    expect(cb3.mock.calls.length).toBe(1)
  })
})
