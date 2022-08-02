const path = require('path')
const babel = require('@babel/core')
const reactPreset = require('@babel/preset-react')


module.exports = {
  process(src, filename, config, options) {
    return babel.transform(
        `
          import React from 'react'
          export default () => (<svg data-filename="${path.relative(process.cwd(), filename)}" />)
        `,
        {
          filename,
          presets: [reactPreset],
          retainLines: true,
        },
    )
  },
}
