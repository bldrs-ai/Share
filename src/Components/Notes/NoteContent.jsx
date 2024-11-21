import React, {ReactElement, useMemo} from 'react'
import Markdown from 'react-markdown'
import CardContent from '@mui/material/CardContent'
import {modifyPlaceMarkHash} from '../Markers/MarkerControl'


/**
 * @property {string} markdownContent The note text in markdown format
 * @return {ReactElement}
 */
export default function NoteContent({markdownContent, issueID, commentID}) {
  /**
   * @param {string} urlStr
   * @return {string} The transformed URL
   */
  function localizeUrl(urlStr) {
    if (urlStr.includes(location.pathname)) {
      return urlStr.substring(urlStr.indexOf('#'))
    }
    return urlStr
  }

  const noteContentLinksLocalized = useMemo(() => {
    // eslint-disable-next-line no-console
    console.log(`issueID:${issueID} - commentID: ${commentID}`)
    return markdownContent.replace(/\((https?:\/\/[^)]+)\)/g, (_, url) => {
      return `(${modifyPlaceMarkHash(localizeUrl(url), issueID, commentID)})`
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdownContent])

  return (
    <CardContent>
      <Markdown>
        {noteContentLinksLocalized}
      </Markdown>
    </CardContent>
  )
}
