import React, {ReactElement, useMemo} from 'react'
import Markdown from 'react-markdown'
import useStore from '../../store/useStore'
import CardContent from '@mui/material/CardContent'
import {modifyPlaceMarkHash, parsePlacemarkFromURL} from '../Markers/hashState'
import {getHashParamsFromHashStr, getObjectParams} from '../../utils/location'
import {HASH_PREFIX_CAMERA} from '../Camera/hashState'
import {HASH_PREFIX_NOTES, HASH_PREFIX_COMMENT} from './hashState'


/**
 * @property {string} markdownContent The note text in markdown format
 * @return {ReactElement}
 */
export default function NoteContent({markdownContent, issueID, commentID}) {
  const setSelectedPlaceMarkInNoteIdData = useStore((state) => state.setSelectedPlaceMarkInNoteIdData)
  const setSelectedPlaceMarkId = useStore((state) => state.setSelectedPlaceMarkId)

  // eslint-disable-next-line no-unused-vars
  const {selectedPlaceMarkInNoteId, cameraHash, forceMarkerNoteSync} = useStore((state) => ({
    selectedPlaceMarkInNoteId: state.selectedPlaceMarkInNoteId,
    cameraHash: state.cameraHash,
    forceMarkerNoteSync: state.forceMarkerNoteSync,
  }))

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
      return `(${modifyPlaceMarkHash(localizeUrl(url), issueID, commentID)})`
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdownContent])

  /**
   * Handle hyperlink clicks
   *
   * @param {React.MouseEvent<HTMLAnchorElement, MouseEvent>} event
   */
  const handleLinkClick = (event) => {
    const urlStr = event.currentTarget.href

    const placeMarkUrl = parsePlacemarkFromURL(urlStr)

    if (placeMarkUrl) {
      const url = new URL(urlStr)
      const noteHash = getHashParamsFromHashStr(url.hash, HASH_PREFIX_NOTES)
      // Retrieve the note ID from the URL hash
      const commentHash = getHashParamsFromHashStr(url.hash, HASH_PREFIX_COMMENT)

      if (commentHash) {
        const params = Object.values(getObjectParams(`#${commentHash}`))

        if (params) {
          const cameraHash_ = getHashParamsFromHashStr(url.hash, HASH_PREFIX_CAMERA)
          setSelectedPlaceMarkInNoteIdData(params[0], cameraHash_, !forceMarkerNoteSync)
          setSelectedPlaceMarkId(Number(params[0]))
          event.preventDefault() // Prevent the default navigation
        }
      } else if (noteHash) {
          const params = Object.values(getObjectParams(`#${noteHash}`))

          if (params) {
            const cameraHash_ = getHashParamsFromHashStr(url.hash, HASH_PREFIX_CAMERA)
            setSelectedPlaceMarkInNoteIdData(params[0], cameraHash_, !forceMarkerNoteSync)
            setSelectedPlaceMarkId(Number(params[0]))
            event.preventDefault() // Prevent the default navigation
        }
      }
    }
  }

  return (
    <CardContent>
      <Markdown
        components={{
          a: ({href, children, ...props}) => (
            <a
              href={href}
              onClick={handleLinkClick}
              {...props}
            >
              {children}
            </a>
          ),
        }}
      >
        {noteContentLinksLocalized}
      </Markdown>
    </CardContent>
  )
}
