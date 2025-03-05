import React, {ReactElement} from 'react'
import ReactMarkdown from 'react-markdown'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import BlogPostLayout from '../layouts/BlogPostLayout'
import {assertDefined} from '../utils/assert'


/**
 * @property {string} title Page title
 * @property {string} dateline Post dateline
 * @property {string} markdownContent Markdown formatted string
 * @return {ReactElement}
 */
export default function MarkdownBlogPost({title, dateline, markdownContent}) {
  assertDefined(title, dateline, markdownContent)
  return (
    <BlogPostLayout title={title} dateline={dateline}>
      <ReactMarkdown
        components={{
          h1: ({node, ...props}) => (
            <Typography variant='h1' gutterBottom {...props}/>
          ),
          h2: ({node, ...props}) => (
            <Typography variant='h2' gutterBottom {...props}/>
          ),
          h3: ({node, ...props}) => (
            <Typography variant='h3' gutterBottom {...props}/>
          ),
          p: ({node, ...props}) => (
            <Typography variant='body1' paragraph {...props}/>
          ),
          a: ({node, ...props}) => <Link {...props}/>,
          // etc. for other elements (img, blockquote, etc.)
        }}
      >
        {markdownContent}
      </ReactMarkdown>
    </BlogPostLayout>
  )
}
