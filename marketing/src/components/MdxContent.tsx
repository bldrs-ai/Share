import {ReactNode} from 'react'
import Link from 'next/link'
import {Box, Link as MuiLink, Typography} from '@mui/material'
import {MDXRemote, type MDXRemoteProps} from 'next-mdx-remote/rsc'


/**
 * Maps MDX/markdown nodes to MUI typography so the blog inherits the site's
 * type scale and theme tokens (rather than the browser defaults that
 * react-markdown would produce). Keep this list narrow — pages should
 * compose richer layouts via explicit JSX in .mdx files when needed.
 */
const components: MDXRemoteProps['components'] = {
  h1: (props) => <Typography variant="h2" component="h1" sx={{mt: 4, mb: 2}} {...props}/>,
  h2: (props) => <Typography variant="h3" component="h2" sx={{mt: 4, mb: 1.5}} {...props}/>,
  h3: (props) => <Typography variant="h4" component="h3" sx={{mt: 3, mb: 1}} {...props}/>,
  p: (props) => <Typography variant="body1" component="p" sx={{my: 2}} {...props}/>,
  ul: (props) => <Box component="ul" sx={{pl: 3, my: 2, '& li': {mb: 0.75}}} {...props}/>,
  ol: (props) => <Box component="ol" sx={{pl: 3, my: 2, '& li': {mb: 0.75}}} {...props}/>,
  li: (props) => <Typography component="li" variant="body1" {...props}/>,
  blockquote: (props) => (
    <Box
      component="blockquote"
      sx={{
        borderLeft: 3,
        borderColor: 'primary.main',
        pl: 2,
        my: 2,
        fontStyle: 'italic',
        opacity: 0.9,
      }}
      {...props}
    />
  ),
  a: ({href, children, ...rest}) => {
    const isExternal = !!href && /^https?:\/\//.test(href)
    if (isExternal) {
      return (
        <MuiLink href={href} target="_blank" rel="noopener noreferrer" {...rest}>
          {children}
        </MuiLink>
      )
    }
    return (
      <MuiLink component={Link} href={href ?? '#'} {...rest}>
        {children}
      </MuiLink>
    )
  },
  code: (props) => (
    <Box
      component="code"
      sx={{
        bgcolor: 'rgba(255,255,255,0.08)',
        px: 0.75,
        py: 0.25,
        borderRadius: 1,
        fontFamily: 'monospace',
        fontSize: '0.92em',
      }}
      {...props}
    />
  ),
  pre: (props) => (
    <Box
      component="pre"
      sx={{
        bgcolor: 'rgba(255,255,255,0.06)',
        p: 2,
        borderRadius: 2,
        overflowX: 'auto',
        '& code': {bgcolor: 'transparent', p: 0},
      }}
      {...props}
    />
  ),
  hr: () => <Box component="hr" sx={{my: 4, border: 0, borderTop: 1, borderColor: 'divider'}}/>,
}


export default function MdxContent({source}: {source: string}): ReactNode {
  // MDXRemote runs at build time in RSC; the result is plain HTML in the
  // exported page — no client JS needed for static content.
  return <MDXRemote source={source} components={components}/>
}
