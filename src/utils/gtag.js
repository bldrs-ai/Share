window.dataLayer = window['dataLayer'] || []
export default function gtag() {
  const dataLayer = window.dataLayer
  dataLayer.push(arguments)
}
gtag('js', new Date())
gtag('config', 'UA-210924287-3')
