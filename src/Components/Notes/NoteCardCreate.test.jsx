import React from 'react'
import {render} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import NoteCardCreate from './NoteCardCreate'


describe('NoteCardCreate', () => {
  it('NoteCardCreate', () => {
    const {getByPlaceholderText, getByTitle} = render(<ShareMock><NoteCardCreate/></ShareMock>)
    expect(getByPlaceholderText('Note Body')).toBeInTheDocument()
    expect(getByPlaceholderText('Note Title')).toBeInTheDocument()
    expect(getByTitle('Submit')).toBeInTheDocument()
  })
})
