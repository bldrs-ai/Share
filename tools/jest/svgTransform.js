import path from 'path'
import babel from '@babel/core'
import reactPreset from '@babel/preset-react'


export default {
  process(src, filename, config, options) {
    return babel.transform(
      `import React from 'react'
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
