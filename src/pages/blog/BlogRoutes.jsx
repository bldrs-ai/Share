import React, {ReactElement} from 'react'
import {Route, Routes} from 'react-router-dom'
import MarkdownBlogPost from '../../Components/MarkdownBlogPost'
import BlogIndex from './BlogIndex'
import Post20250225 from './Post20250225.md'
import Post20241205 from './Post20241205.md'


/** @return {ReactElement} */
export default function BlogRoutes() {
  return (
    <Routes>
      <Route path='/' element={<BlogIndex/>}/>
      <Route
        path='/2025-02-25-high-perf-js-parsing-complete-ifc-step-coverage-exact-bools'
        element={
          <MarkdownBlogPost
            title='Tech Talk: High-Perf JS Parsing, Complete IFC+STEP Coverage, Exact Bools'
            dateline='2025-02-25'
            markdownContent={Post20250225}
          />
        }
      />
      <Route
        path='/2024-12-05-bldrs-announces-launch-of-share-and-the-conway-engine'
        element={
          <MarkdownBlogPost
            title='Bldrs Announces Launch of Share and the Conway Engine'
            dateline='2024-12-05'
            markdownContent={Post20241205}
          />
        }
      />
    </Routes>
  )
}
