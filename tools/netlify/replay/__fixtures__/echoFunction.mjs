// A stand-in Netlify v1 function for runScenario.test.js: one outbound call,
// then a response built from its answer. `?throw=1` makes it throw;
// `?nothing=1` makes it resolve to undefined.
export const handler = async (event) => {
  const upstream = await fetch('https://upstream.test/thing', {
    method: 'POST',
    headers: {'content-type': 'application/json', 'authorization': 'Bearer upstream-token'},
    body: JSON.stringify({n: 1, from: process.env.WHO}),
  })
  const answer = await upstream.json()
  if (event.queryStringParameters && event.queryStringParameters.throw) {
    throw new Error('boom')
  }
  if (event.queryStringParameters && event.queryStringParameters.nothing) {
    return undefined
  }
  return {statusCode: 200, headers: {'X-Echo': 'yes'}, body: JSON.stringify({got: answer.v, method: event.httpMethod})}
}
