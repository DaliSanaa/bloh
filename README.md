# Bloh

Stateless document extraction API with subscription billing, API key management, and credit-based usage tracking.

## Stack

- **Runtime:** Node.js 20+, TypeScript (strict), ESM
- **Framework:** Fastify
- **Database:** SQLite (better-sqlite3)
- **Parsing:** [@llamaindex/liteparse](https://www.npmjs.com/package/@llamaindex/liteparse)
- **LLM:** Groq (`qwen/qwen3-32b`)
- **Billing:** Stripe
- **Auth:** Clerk (Google, Microsoft, GitHub, Apple, email, and more)

## Quick start

```bash
cp .env.example .env
# Fill in GROQ_API_KEY, Stripe keys, SESSION_SECRET, BLOH_BASE_URL, Clerk keys

npm install
npm run build
npm start
```

### Clerk setup

1. Create an application at [clerk.com](https://clerk.com).
2. Copy **Publishable key** and **Secret key** into `.env`.
3. In Clerk Dashboard → **Configure** → **SSO connections**, enable providers (Google, Microsoft, GitHub, Apple, LinkedIn, Discord, etc.).
4. Under **Paths**, set sign-in URL to `/login` and sign-up URL to `/signup`.
5. Add your app URL (e.g. `http://localhost:3001`) under **Domains**.

Clerk’s SignIn/SignUp components automatically show every provider you enable in the dashboard.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GROQ_API_KEY` | Yes | — | Groq API key |
| `STRIPE_SECRET_KEY` | Yes | — | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | — | Stripe webhook signing secret |
| `STRIPE_PRICE_PRO` | Yes | — | Stripe price ID for Pro |
| `STRIPE_PRICE_MAX` | Yes | — | Stripe price ID for Max |
| `SESSION_SECRET` | Yes | — | Cookie signing secret |
| `BLOH_BASE_URL` | Yes | — | Public base URL (e.g. https://bloh.dev) |
| `CLERK_PUBLISHABLE_KEY` | Yes | — | Clerk publishable key |
| `CLERK_SECRET_KEY` | Yes | — | Clerk secret key |
| `DATABASE_PATH` | No | `./data/bloh.db` | SQLite file path |
| `CREDIT_MULTIPLIER` | No | `1.45` | Credit cost multiplier |
| `PORT` | No | `3000` | HTTP port |

## Plans & credits

| Plan | Monthly credits |
|---|---|
| Free | 50 |
| Pro | 2,000 |
| Max | 20,000 |

## API endpoints

- `POST /extract` — Extract document (requires `x-api-key`)
- `POST /estimate` — Estimate credits (requires `x-api-key`)
- `GET /auth/config` — Clerk frontend config
- `GET /auth/clerk/callback` — Post-sign-in sync (Clerk redirect)
- `GET /auth/me` — Current user (session)
- `GET /account/usage` — Usage & plan (session)
- `GET /account/keys` — List API keys (session)
- `POST /billing/webhook` — Stripe webhooks

## License

Private — all rights reserved.
