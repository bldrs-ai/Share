import React from 'react'
import * as mxwidgets from 'matrix-widget-api'


/**
 * @return {object} React component
 */
export default function MatrixWidgetApi() {
  const widgetId = null // if you know the widget ID, supply it.
  const api = new mxwidgets.WidgetApi(widgetId)
  console.log('mxwidgets:', mxwidgets, api)
  return (
    <>
      Matrix
    </>
  )
}
