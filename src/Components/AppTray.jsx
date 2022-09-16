import React, {useState} from 'react'


/**
 * @return {object} React component
 */
export default function AppTray() {
  const [frameSource, setFrameSource] = useState('https://www.vyzn.tech/')
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: '0.5em',
          right: '5em',
          width: '20em',
        }}
      >
        <form name='appFrame' onSubmit={(e) => {
          e.preventDefault()
          setFrameSource(document.forms.appFrame.children.frameSource.value)
        }}
        >
          IFrame source: <input name='frameSource' defaultValue={frameSource} width='20'/>
        </form>
        <iframe
          title='Vyzn'
          src={frameSource}
          style={{
            border: 'solid 3px red',
            width: '20em',
            height: '20em',
          }}
        ></iframe>
      </div>
    </>
  )
}
