// openrouterClient.js
/**
 *
 */
export async function askLLM({messages, model = 'mistralai/mistral-7b-instruct'}) {
  const url = 'https://openrouter.ai/api/v1/chat/completions'

  const body = {
    model,
    messages, // [{ role:'system'|'user'|'assistant', content:'...' }, …]
    max_tokens: 2048,
    temperature: 0.7,
    stream: false, // true → Server-Sent Events stream
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      // OpenRouter wants these two for routing / analytics:
      'HTTP-Referer': location.origin, // your public URL in prod
      'X-Title': 'Bldrs Viewer Chat', // short app name
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
throw new Error(await res.text())
}
  const data = await res.json()
  return data.choices[0].message.content.trim()
}
