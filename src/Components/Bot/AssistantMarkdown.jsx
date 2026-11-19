import React, {ReactElement} from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {Box, Link} from '@mui/material'


/**
 * Only http(s) links are followed. The default allows `mailto:` and `tel:`
 * too, which a model reply has no business offering; anything else (a
 * `javascript:` URL, a relative path that would navigate Share itself) is
 * rendered as plain text by `LinkOrText`.
 *
 * @param {string} uri
 * @return {string} the URI if it is http(s), else ''
 */
export function allowedLinkUri(uri) {
  try {
    const {protocol} = new URL(uri)
    return protocol === 'https:' || protocol === 'http:' ? uri : ''
  } catch {
    return ''
  }
}


/**
 * @param {object} props from react-markdown: `href`, `children`
 * @return {ReactElement}
 */
function LinkOrText({href, children}) {
  if (!href) {
    return <>{children}</>
  }
  return <Link href={href} target='_blank' rel='noopener noreferrer'>{children}</Link>
}


/**
 * A wide table scrolls within the bubble instead of widening it.
 *
 * @param {object} props from react-markdown
 * @return {ReactElement}
 */
function ScrollTable({node, ...props}) {
  return (
    <Box sx={{overflowX: 'auto', maxWidth: '100%', my: 0.5}}>
      <table {...props}/>
    </Box>
  )
}


/**
 * An assistant reply as Markdown (#assist-310). The text can be steered by a
 * model file's contents as much as by the model, so it is rendered as
 * untrusted: react-markdown builds React elements, never HTML strings, and
 * on top of that raw HTML is skipped, images are dropped (a remote image is
 * a tracking pixel), and links open in a new tab for http(s) only.
 *
 * A reply still streaming is re-rendered per chunk; an unclosed `**` or
 * fence is just text until its closer arrives, and a fence left open is a
 * code block to the end, which is what Markdown defines.
 *
 * @property {string} text the reply's Markdown
 * @return {ReactElement}
 */
export default function AssistantMarkdown({text}) {
  return (
    <Box
      sx={{
        'overflowWrap': 'anywhere',
        'minWidth': 0,
        '& > :first-of-type': {mt: 0},
        '& > :last-child': {mb: 0},
        '& p': {my: 0.75},
        '& h1, & h2, & h3, & h4, & h5, & h6': {fontSize: '1rem', fontWeight: 500, lineHeight: 1.4, mt: 1.25, mb: 0.5},
        '& ul, & ol': {my: 0.75, pl: 3},
        '& li': {my: 0.25},
        '& blockquote': {
          my: 0.75, mx: 0, pl: 1.5,
          borderLeft: (theme) => `3px solid ${theme.palette.divider}`,
          color: 'text.secondary',
        },
        '& code': {
          fontFamily: '"Roboto Mono", monospace',
          fontSize: '0.85em',
          px: 0.5,
          borderRadius: '4px',
          backgroundColor: (theme) => theme.palette.action.hover,
        },
        '& pre': {
          my: 0.75, p: 1, borderRadius: '4px', overflowX: 'auto', maxWidth: '100%',
          backgroundColor: (theme) => theme.palette.action.hover,
          // Scrolls rather than wraps, so the break rule above must not apply.
          overflowWrap: 'normal',
        },
        '& pre code': {p: 0, backgroundColor: 'transparent', fontSize: '0.85rem'},
        '& table': {borderCollapse: 'collapse', fontSize: '0.85rem'},
        '& th, & td': {
          border: (theme) => `1px solid ${theme.palette.divider}`, px: 1, py: 0.5, textAlign: 'left', verticalAlign: 'top',
        },
        '& th': {fontWeight: 500},
        '& hr': {border: 0, borderTop: (theme) => `1px solid ${theme.palette.divider}`, my: 1},
      }}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        disallowedElements={['img']}
        transformLinkUri={allowedLinkUri}
        components={{a: LinkOrText, table: ScrollTable}}
      >
        {text}
      </Markdown>
    </Box>
  )
}
