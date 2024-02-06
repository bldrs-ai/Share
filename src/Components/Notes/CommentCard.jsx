import React, {useState} from 'react'
import {useAuth0} from '@auth0/auth0-react'
import Avatar from '@mui/material/Avatar'
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import {
  CardMenu,
  CommentCardBody,
} from './NoteCardSupportComponents'
import useStore from '../../store/useStore'
import {assertDefined} from '../../utils/assert'
import {deleteComment} from '../../utils/GitHub'


/**
 * Note card
 *
 * @param {number} id note id
 * @param {number} index note index
 * @param {string} username username of the note author
 * @param {string} title note title
 * @param {string} avatarUrl user avatarUrl
 * @param {string} body note body
 * @param {string} date note date
 * @param {number} numberOfComments number of replies to the note - referred to as comments in GH
 * @param {boolean} expandedImage governs the size of the image, small proportions on mobile to start
 * @param {boolean} isComment Comments/replies are formatted differently
 * @return {object} React component
 */
export default function CommentCard({
  id = null,
  index = null,
  username = '',
  title = '',
  body = '',
  commentId = null,
  noteNumber = '',
  avatarUrl = '',
  date = '',
}) {
  assertDefined(id, index)
  const [anchorEl, setAnchorEl] = useState(null)
  const accessToken = useStore((state) => state.accessToken)
  const {user} = useAuth0()
  const dateParts = date.split('T')
  const open = Boolean(anchorEl)
  const comments = useStore((state) => state.comments)
  const repository = useStore((state) => state.repository)
  const setComments = useStore((state) => state.setComments)


  /** Triggerred when menu is closed*/
  function handleMenuClose() {
    setAnchorEl(null)
  }

  /** Triggerred when menu icon is activated*/
  function handleMenuClick(event) {
    setAnchorEl(event.currentTarget)
  }


  /**
   * Remove comment
   *
   * @param {string} repository
   * @param {string} accessToken
   * @param {number} commentId
   * @return {object} return github return object
   */
  async function removeComment() {
    const currentComment = comments.map((comment) => ({
      ...comment,
      synched: (comment.id !== commentId) && comment.synched,
    }))
    const updatedComments = currentComment.filter((comment) => comment.id !== commentId)
    setComments(updatedComments)
    await deleteComment(repository, commentId, accessToken)
  }


  return (
    <Card
      elevation={1}
      variant='note'
      sx={{fontSize: '1em'}}
    >
      <CardHeader
        title={title}
        avatar={<Avatar alt={username} src={avatarUrl}/>}
        subheader={<div>{username} at {dateParts[0]} {dateParts[1]}</div>}
        action={
          user && user.nickname === username &&
          <CardMenu
            handleMenuClick={handleMenuClick}
            handleMenuClose={handleMenuClose}
            anchorEl={anchorEl}
            deleteComment={removeComment}
            noteNumber={noteNumber}
            open={open}
            isNote={false}
          />
        }
      />
      <CommentCardBody editBody={body}/>
    </Card>
  )
}
