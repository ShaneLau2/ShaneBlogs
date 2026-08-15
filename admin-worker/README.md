# Firefly Admin Auth Worker

GitHub OAuth + GitHub API proxy for the **online** admin panel (`public/admin/`).
Replaces the old "password + Personal Access Token" scheme:

- The browser never sees a GitHub token.
- The GitHub OAuth token lives only inside this Worker, encrypted into an
  `HttpOnly; Secure; SameSite=None` session cookie.
- Only the account listed in `ADMIN_LOGIN` may log in.
- Sessions are short-lived (`SESSION_TTL`, default 24 h).

## How it works

```
SPA (github.io) ──▶ /api/oauth/authorize ──▶ github.com (user authorizes)
        ◀────────── redirect back with code ─
SPA ──▶ /api/oauth/callback ──▶ exchanges code, verifies owner,
        ◀── sets encrypted session cookie ── stores token server-side
SPA ──▶ /api/gh/repos/... ──▶ Worker injects `Authorization: Bearer <token>`
        ◀── proxy response ──▶ api.github.com
```

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/oauth/authorize` | redirect to GitHub OAuth (sets a `state` cookie) |
| `GET /api/oauth/callback` | exchange code, verify `ADMIN_LOGIN`, set session cookie, redirect to `APP_URL/admin/` |
| `GET /api/me` | current session info (or 401) |
| `POST /api/logout` | clear the session cookie |
| `GET\|POST\|PUT\|DELETE /api/gh/*` | proxy to `api.github.com/*` with the session token |
| `GET /api/music/search?q=` | search mp3juice for songs (online music search) |
| `POST /api/music/download` | download an MP3 via mp3juice, push it to the repo (`public/assets/music/`) and prepend it to `src/data/music-playlist.json`; body `{ videoId, title, repo, branch }` |

## Setup

### 1. Create a GitHub OAuth App

https://github.com/settings/developers → **New OAuth App**

- **Application name**: e.g. `Firefly Blog Admin`
- **Homepage URL**: `https://<user>.github.io/<repo>/admin/`
- **Authorization callback URL**: `https://<your-worker>.workers.dev/api/oauth/callback`
  (must match exactly; if you later add a custom domain, update it here too)

Note the **Client ID** (public) and **Client secret** (keep secret).

### 2. Configure the Worker

Edit `wrangler.jsonc`:

- `GITHUB_CLIENT_ID` — your OAuth App client id
- `ADMIN_LOGIN` — the only GitHub account allowed to manage the blog
- `APP_URL` — the blog origin (SPA lives at `<APP_URL>/admin/`)
- `OAUTH_SCOPE` — default `repo`; on the GitHub grant screen choose **only the blog repo**
- `SESSION_TTL` — session lifetime in seconds

Then set secrets (they are not stored in the repo):

```bash
wrangler secret put GITHUB_CLIENT_SECRET   # from the OAuth App
wrangler secret put AUTH_SECRET            # e.g. openssl rand -hex 32
```

### 3. Deploy

```bash
pnpm admin-worker:deploy     # or: wrangler deploy --config admin-worker/wrangler.jsonc
```

Local dev:

```bash
pnpm admin-worker:dev        # http://localhost:8787
# for local testing over http, set COOKIE_SECURE=false in wrangler.jsonc vars
```

### 4. Point the SPA at the Worker

In `public/admin/config.json`:

```json
{
  "repo": "ShaneLau2/ShaneBlogs",
  "branch": "master",
  "title": "Shane's Blog Admin",
  "apiBase": "https://<your-worker>.workers.dev"
}
```

Push to GitHub, then visit `https://<user>.github.io/<repo>/admin/` and sign in.

## Local tests

No real credentials needed — GitHub endpoints are mocked:

```bash
node admin-worker/test.mjs
```

## Security notes

- The session cookie is AES-GCM encrypted with a key derived from `AUTH_SECRET`
  and contains `{ login, token, exp }`. `HttpOnly` + `SameSite=None` + `Secure`
  keep it out of JavaScript and allow cross-site (github.io → workers.dev) use.
- An OAuth `state` cookie (600 s) protects the callback against CSRF.
- The GitHub token is never sent to the browser; `/api/gh/*` refuses requests
  without a valid, unexpired session from the `ADMIN_LOGIN` account.
- For a public repo, you may tighten `OAUTH_SCOPE` to `public_repo`.
