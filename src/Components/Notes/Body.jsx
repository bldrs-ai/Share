import React from 'react'
import ReactMarkdown from 'react-markdown'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'


/**
 * @property {Function} selectCard Card click handler
 * @property {string} markdownContent The note text in markdown format
 * @return {React.ReactElement}
 */
export default function CardBody({selectCard, markdownContent}) {
  return (
    <CardActionArea
      onClick={selectCard}
      disableRipple
      disableTouchRipple
      data-testid='card-body'
    >
      <CardContent>
        <ReactMarkdown>
          {markdownContent}
        </ReactMarkdown>
      </CardContent>
    </CardActionArea>
  )
}
