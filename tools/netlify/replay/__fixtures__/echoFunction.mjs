// A stand-in Netlify v1 function for runScenario.test.js: one outbound call,
// then a response built from its answer. `?throw=1` makes it throw;
// `?nothing=1` makes it resolve to undefined; `?also=1` makes a second call
// (GET https://upstream.test/also) after the first, for the ordering cases.
// `X-Now` reports the clock, for the `now` cases.
export const handler = async (event) => {
  const upstream = await fetch('https://upstream.test/thing', {
    method: 'POST',
    headers: {'content-type': 'application/json', 'authorization': 'Bearer upstream-token'},
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
  return {statusCode: 200, headers: {'X-Echo': 'yes', 'X-Now': now}, body: JSON.stringify({got: answer.v, method: event.httpMethod})}
}
