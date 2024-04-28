import React, {ReactElement} from 'react'
import CardActionArea from '@mui/material/CardActionArea'
import NoteContent from './NoteContent'


/**
 * @property {Function} selectCard Card click handler
 * @property {string} markdownContent The note text in markdown format
 * @return {ReactElement}
 */
export default function NoteBody({selectCard, markdownContent}) {
  return (
    <CardActionArea
      onClick={selectCard}
      disableRipple
      disableTouchRipple
      data-testid='note-body'
    >
      <NoteContent markdownContent={markdownContent}/>
    </CardActionArea>
  )
}
