window.dataLayer = window['dataLayer'] || []


/** Create google analytics tag. */
export default function gtag() {
  const dataLayer = window.dataLayer
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/arguments

  dataLayer.push(arguments)
}
gtag('js', new Date())
gtag('config', 'UA-210924287-3')
