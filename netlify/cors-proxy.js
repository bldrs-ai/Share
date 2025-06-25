import express from 'express'
import {handler} from './functions/proxy-handler.js'


const app = express()


/**
 * Pass the query params to the handler used by netlify, and respond with
 * the result.
 */
app.get('/cors-proxy', async (req, res) => {
  const event = {
    queryStringParameters: req.query,
    headers: {
      origin: req.headers.origin,
    },
  }
  const result = await handler(event)
  res.status(result.statusCode).set(result.headers)
  const resultMaybeDecoded = result.isBase64Encoded ? Buffer.from(result.body, 'base64') : result.body
  res.send(resultMaybeDecoded)
})


const HTTP_PORT = 8090
app.listen(HTTP_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Dev server running on http://localhost:${HTTP_PORT}`)
})

