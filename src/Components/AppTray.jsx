import React from 'react'


/**
 * @return {object} React component
 */
export default function AppTray() {
  return (
    <>
      App IFrame:
      <iframe
        title='Vyzn'
        src='https://www.vyzn.tech/'
        width='400'
        height='400'
        style={{
          position: 'absolute',
          top: '40px',
          right: '40px',
          border: 'solid 3px red',
        }}
      ></iframe>
    </>
  )
}
