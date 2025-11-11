import React, {ReactElement} from 'react'
import {Typography} from '@mui/material'
import {assertDefined} from '../utils/assert'
import TitledLayout from './TitledLayout'


/**
 * Layout for blog posts.
 *
 * @property {string} title Page title
 * @property {string} dateline Page title
 * @property {Array<ReactElement>} children The text content elements for the page
 * @return {ReactElement}
 */
export default function BlogPostLayout({title, dateline, children}) {
  assertDefined(title, dateline, children)
  return (
    <TitledLayout title={title}>
      <Typography variant='h2'>{dateline}</Typography>
      {children}
    </TitledLayout>
  )
}
