import React, {ReactElement, useMemo} from 'react'
import Markdown from 'react-markdown'
import CardContent from '@mui/material/CardContent'


/**
 * @property {string} markdownContent The note text in markdown format
 * @return {ReactElement}
 */
export default function NoteContent({markdownContent}) {
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
    return markdownContent.replace(/\((https?:\/\/[^)]+)\)/g, (_, url) => {
      return `(${localizeUrl(url)})`
    })
  }, [markdownContent])

  return (
    <CardContent>
      <Markdown>
        {noteContentLinksLocalized}
      </Markdown>
    </CardContent>
  )
}
