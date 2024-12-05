import React, {ReactElement} from 'react'
import {assertDefined} from '../utils/assert'
import TitledLayout from './TitledLayout'


/**
 * Layout for blog posts.
 *
 * @property {string} title Page title
 * @property {Array<ReactElement>} children The text content elements for the page
 * @return {ReactElement}
 */
export default function BlogLayout({title, children}) {
  assertDefined(title, children)
  return (
    <TitledLayout title={title}>
      {children}
    </TitledLayout>
  )
}
