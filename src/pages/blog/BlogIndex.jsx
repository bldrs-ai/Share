import React, {ReactElement} from 'react'
import Link from '@mui/material/Link'
import BlogLayout from '../../layouts/BlogLayout'


/** @return {ReactElement} */
export default function BlogIndex() {
  return (
    <BlogLayout title='Blog Posts'>
      2024-12-05:
      <Link href="/blog/2024-12-05-bldrs-announces-launch-of-share-and-the-conway-engine">
        Bldrs Announces Launch of Share and the Conway Engine
      </Link>
    </BlogLayout>
  )
}
