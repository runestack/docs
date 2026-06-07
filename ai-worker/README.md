# Rune docs — "Ask AI" Worker

The Rune docs site ([docs.runestack.io](https://docs.runestack.io)) ships as a
**static export** to Netlify (`npm install && npx markline export`). Markline's
built-in `/api/ai` route only runs on a Node/Vercel server, so on a static host
the **Ask AI** assistant needs an external proxy.

This Worker is that proxy. It holds the OpenRouter key as a Cloudflare **secret**
on the edge — the browser only ever talks to the Worker, never to OpenRouter, and
never sees the key. It enforces an origin allow-list, a per-IP rate limit, and a
token cap so the endpoint can't be turned into an open relay to our paid LLM.

The Worker source (`src/worker.ts`) is Markline's reference implementation,
vendored unchanged so we control deploys; only `wrangler.toml` is customized for
Rune.

## Activate (about 2 minutes)

```bash
cd ai-worker
npm install

# 1) put the OpenRouter key on the edge (never committed, never in the browser)
npx wrangler secret put MARKLINE_AI_KEY        # paste the OpenRouter key (sk-or-...)

# 2) ship it
npm run deploy
```

`wrangler.toml` is already configured for Rune:

- `MARKLINE_AI_PROVIDER = "openrouter"`, `MARKLINE_AI_MODEL = "openai/gpt-4o-mini"`
- `MARKLINE_ALLOWED_ORIGIN = "https://docs.runestack.io"`
- served on the custom domain `ask.runestack.io` — which is what
  [`markline.json`](../markline.json)'s `ai.endpoint` points at.

The custom-domain route needs the `runestack.io` zone on this Cloudflare account.
To skip the custom domain, delete the `routes` block in `wrangler.toml`, deploy,
and set `ai.endpoint` in `markline.json` to the printed
`https://rune-docs-ai.<account>.workers.dev` URL instead.

Because `ai.endpoint` is set, Markline renders the Ask AI UI even in the static
export — no docs rebuild is required for the Worker, but the Worker must be live
for the button to work.

## Configuration (`wrangler.toml` `[vars]`)

| var | meaning |
|---|---|
| `MARKLINE_AI_PROVIDER` | `openai` · `openrouter` · `together` · `groq` · `fireworks` · `local` · `openai-compatible` |
| `MARKLINE_AI_BASE_URL` | base URL override (required for `openai-compatible`) |
| `MARKLINE_AI_MODEL` | model id, e.g. `openai/gpt-4o-mini` |
| `MARKLINE_AI_MAX_TOKENS` | response token cap (default 1024) |
| `MARKLINE_ALLOWED_ORIGIN` | comma-separated docs origin(s) allowed to call the Worker; `*` allows any (not recommended) |
| `MARKLINE_RATE_PER_MIN` | per-IP requests/min (default 10) |
| `MARKLINE_SITE_NAME` | sent as `X-Title` to OpenRouter |
| `MARKLINE_AI_SYSTEM_PROMPT` | optional system-prompt override |
| `MARKLINE_AI_KEY` | **secret** — set with `wrangler secret put`, never in this file |

## Cost & abuse

A public AI endpoint is a relay to our paid LLM. This Worker ships with an
**origin allow-list** (`MARKLINE_ALLOWED_ORIGIN`), a **per-IP rate limit**
(`MARKLINE_RATE_PER_MIN`), and a **token cap** (`MARKLINE_AI_MAX_TOKENS`). The
rate limit is per-isolate in-memory; for strict global limits, back it with
Workers KV or a Durable Object.
