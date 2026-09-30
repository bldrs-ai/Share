# Replay scenarios

Recorded conversations for each Netlify Function. Every scenario is replayed
twice:
- against the source, by `../replaySource.test.js`;
- against the deployed bundle, by `tools/netlify/functionBundler.test.js`.

Why that matters: [design/new/netlify-functions-testing.md](../../../../design/new/netlify-functions-testing.md).

One directory per function, named exactly like the function, with one
`.json` file per scenario. `fixtures/` holds shared payloads.

## Format

```jsonc
{
  "description": "One sentence: what this conversation proves.",
  "env": {"NODE_ENV": "test", "AUTH0_DOMAIN": "…"},       // the function's ENTIRE env (plus PATH)
  "request": {
    "method": "POST",
    "path": "/.netlify/functions/<name>",
    "headers": {"authorization": "Bearer user-access-token"},
    "query": {"name": "glbExport"},                         // optional
    "body": {"key": "…"},                                   // object → JSON; string → sent as-is
    "sign": "stripe"                                        // optional: add a fresh Stripe-Signature
  },
  "exchanges": [                                            // every outbound call, IN ORDER
    {
      "request": {
        "method": "GET",
        "url": "https://…",                                  // exact, query included
        "headers": {"authorization": "Bearer …"},            // optional, subset
        "body": {"app_metadata": {"…": "…"}}                  // optional, subset
      },
      "response": {"status": 200, "json": {}}                // or "text", "headers", or {"networkError": true}
    }
  ],
  "expect": {
    "statusCode": 200,
    "json": {"url": "…"},                                    // optional, subset of the parsed body
    "bodyIncludes": "…",                                     // optional
    "headers": {"access-control-allow-origin": "…"}          // optional, subset, case-insensitive
  }
}
```

**Matching.** Objects match as subsets: keys a scenario doesn't name are
ignored. Arrays match by length and position. Anything else matches by `===`.
Outbound request bodies are decoded by content type, so a form-encoded body
(the Stripe SDK's) matches as an object too.

The replay fails if:
- the function makes a call the scenario doesn't list;
- a listed call is never made;
- a call goes out in a different order.

**`$fixture`.** `{"$fixture": "stripe/customer.json"}` anywhere is replaced
by that file from `fixtures/`, resolved recursively.
`{"$fixture": "…", "$merge": {…}}` overlays a variant onto it. Objects merge
key by key; arrays are replaced whole. Reusable exchanges live in
`fixtures/exchanges/`, and per-context environments in `fixtures/env/`.

**Signatures.** `"sign": "stripe"` signs the body at replay time with
`env.STRIPE_WEBHOOK_SECRET`. A recorded `Stripe-Signature` would be rejected
after five minutes.

## Rules

- Every function needs at least one scenario, and one of them must be the
  unauthenticated request that `tools/netlify/smokeFunctions.mjs` sends to the
  live site. Tests enforce both.
- Keep `env` minimal and explicit. It *replaces* the process environment, so
  a scenario can't pass by accident on a developer's own secrets.
- The fixtures are synthetic, in the documented shape of each upstream. How
  to swap in real captures is in the design doc, under §Recording fixtures.
  Scrub names, emails and tokens before committing.
