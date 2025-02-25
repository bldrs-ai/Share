import React, {ReactElement} from 'react'
import Link from '@mui/material/Link'
import BlogLayout from '../../layouts/BlogLayout'


/** @return {ReactElement} */
export default function BlogIndex() {
  return (
    <BlogLayout title='Blog Posts'>
      <ul reversed>
        <li>2025-02-25:&nbsp;
          <Link href="/blog/2025-02-25-high-performance-cad-js-parsing-ifc-schema-coverage-exact-csg">
            Tech Talk: High-Performance CAD: JS Parsing, IFC Schema Coverage, Exact CSG
          </Link>
        </li>
        <li>2024-12-05:&nbsp;
          <Link href="/blog/2024-12-05-bldrs-announces-launch-of-share-and-the-conway-engine">
            Bldrs Announces Launch of Share and the Conway Engine
          </Link>
        </li>
      </ul>
    </BlogLayout>
  )
}
