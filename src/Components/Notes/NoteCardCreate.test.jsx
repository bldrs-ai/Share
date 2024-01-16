import React from 'react'
import {render} from '@testing-library/react'
import NoteCardCreate from './NoteCardCreate'
import {ThemeCtx} from '../../theme/Theme.fixture'


describe('NoteCardCreate', () => {
  it('NoteCardCreate', () => {
    const {getByPlaceholderText, getByTitle} = render(<ThemeCtx><NoteCardCreate/></ThemeCtx>)
    expect(getByPlaceholderText('Note Body')).toBeInTheDocument()
    expect(getByPlaceholderText('Note Title')).toBeInTheDocument()
    expect(getByTitle('Submit')).toBeInTheDocument()
  })
})
