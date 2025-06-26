import express from 'express'
import proxyHandler from './functions/proxy-handler.js'


const app = express()

app.get('/.netlify/functions/proxy-handler', async (req, res) => {
  // Build a Web standard Request object from the incoming Express req
  const origin = req.headers.origin
  const url = new URL(`http://localhost${req.originalUrl}`)
  const headers = new Headers({origin})
  
  const request = new Request(url.toString(), {
    method: 'GET',
    headers,
  })

  const response = await proxyHandler(request)

  // Copy headers
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

  res.status(response.status)

  if (response.body) {
    const reader = response.body.getReader()
    const stream = new ReadableStream({
      async start(controller) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          controller.enqueue(value)
        }
        controller.close()
      },
    })

    const nodeStream = await streamToNodeReadable(stream)
    nodeStream.pipe(res)
  } else {
    const bodyText = await response.text()
    res.send(bodyText)
  }
})


async function streamToNodeReadable(webStream) {
  const { Readable } = await import('stream')
  const reader = webStream.getReader()
  return new Readable({
    async read() {
      const { done, value } = await reader.read()
      if (done) {
        this.push(null)
      } else {
        this.push(Buffer.from(value))
      }
    },
  })
}


const HTTP_PORT = 8090
app.listen(HTTP_PORT, () => {
  console.log(`Dev server running on http://localhost:${HTTP_PORT}`)
})
