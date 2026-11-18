// A stand-in Netlify v1 function for runScenario.test.js: one outbound call,
// then a response built from its answer. `?throw=1` makes it throw;
// `?nothing=1` makes it resolve to undefined; `?also=1` makes a second call
// (GET https://upstream.test/also) after the first, for the ordering cases.
// `X-Now` reports the clock, for the `now` cases. `?text=1` sends the same
// JSON as text/plain, the way @netlify/blobs PUTs a value, for `bodyJson`.
// `X-Uuid` reports `randomUUID()` (imported, as a function would), for `uuid`.
import {randomUUID} from 'node:crypto'


export const handler = async (event) => {
  const asText = Boolean(event.queryStringParameters && event.queryStringParameters.text)
  const upstream = await fetch('https://upstream.test/thing', {
    method: 'POST',
    headers: {'content-type': asText ? 'text/plain' : 'application/json', 'authorization': 'Bearer upstream-token'},
    body: JSON.stringify({n: 1, from: process.env.WHO}),
  })
  const answer = await upstream.json()
  if (event.queryStringParameters && event.queryStringParameters.also) {
    await fetch('https://upstream.test/also')
  }
  if (event.queryStringParameters && event.queryStringParameters.throw) {
    throw new Error('boom')
  }
  if (event.queryStringParameters && event.queryStringParameters.nothing) {
    return undefined
  }
  const now = `${new Date().toISOString()} ${Date.now()}`
  const headers = {'X-Echo': 'yes', 'X-Now': now, 'X-Uuid': randomUUID()}
  return {statusCode: 200, headers, body: JSON.stringify({got: answer.v, method: event.httpMethod})}
}
