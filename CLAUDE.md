# DockLite Web

A lightweight browser-based Docker UI covering common Docker Desktop workflows
on a local Ubuntu machine — a React frontend plus a small local backend that
talks to Docker.

## Architecture

- **Frontend** (`src/`): React 19 + Vite 8 + TypeScript 7, Tailwind CSS 4 +
  shadcn/ui, TanStack Query for server state, react-router 7. The API client
  and auth/stream plumbing live in `src/lib/api/`.
- **Backend** (`server/src/`): Express 5 + `ws`, talking to Docker via
  `dockerode`. Zod 4 validates requests; argon2 hashes the admin password.
  Listens on port 9001.
- **Adapters**: the real Docker adapter over `/var/run/docker.sock` (default),
  or an in-memory **mock** adapter (`DOCKLITE_ADAPTER=mock`) for tests and UI
  work without a Docker daemon.
- **Streaming**: container logs stream over SSE (`EventSource`); interactive
  exec runs over a WebSocket. Neither transport can send headers, so the auth
  token rides in the `access_token` query param — `resolveStreamEndpoint`
  (`src/lib/api/client.ts`) is the single seam that owns base-URL resolution,
  the http→ws flip, and token attachment. Ordinary fetches use a Bearer header
  and must never put the token in the URL.
- **Engine targets** (`server/src/engine-targets/`): manage local and remote
  Docker engines (unix socket / TLS / SSH).

## Commands (pnpm only — never npm or yarn)

- `pnpm dev` — frontend only (Vite, port 8080)
- `pnpm dev:full` — frontend + real Docker backend
- `pnpm dev:mock` — frontend + mock backend (no Docker needed)
- `pnpm build` — production build
- `pnpm lint` — oxlint
- `pnpm test` — web unit tests (Vitest) · `pnpm server:test` — backend tests
- `pnpm exec tsc -p tsconfig.app.json --noEmit` — web typecheck ·
  `pnpm server:typecheck` — backend typecheck
- `pnpm test:e2e` — Playwright e2e (starts its own mock backend + frontend)

Never claim a check passed without running it and reading the output.

## Conventions

- **TypeScript**: no `any` unless genuinely unavoidable; prefer `unknown`,
  generics, and narrowed unions. Both `src` and `server/src` must typecheck.
- **Linting**: oxlint (`.oxlintrc.json`); `react/rules-of-hooks` is enforced as
  an error.
- Prefer the smallest complete change; follow existing patterns; no speculative
  abstractions; never silently swallow errors. Match the surrounding file's
  style — naming, comment density, idioms.

## Secrets & runtime state

Never commit runtime state or secrets. These are gitignored and regenerated at
startup — do not track them:

- `server/data/auth-config.json` — JWT signing secret + admin password hash
- `server/data/engine-targets.json` — saved engine targets
- `server/data/tls/` — dev TLS material
- `server/.env` — local config (copy from `server/.env.example`)

First-run auth is seeded as `admin` / `admin` (`defaultCredentialsActive`
signals a change is due). The `jwtSecret` is generated per install with
`randomBytes` unless `DOCKLITE_AUTH_JWT_SECRET` is set — never hardcode it.
Credential paths (SSH key, TLS ca/cert/key) are redacted from health messages
and API responses, and plain (non-TLS) TCP Docker targets are rejected by
design.

## Tooling

- pnpm 11 (pinned via `packageManager`). Native postinstall builds are
  allowlisted in `pnpm-workspace.yaml` (`allowBuilds`: argon2, ssh2,
  cpu-features, @swc/core, esbuild, protobufjs).
- Don't start dev servers or full builds unless asked or needed to verify a
  change.

## Git

- Preserve unrelated staged / unstaged / untracked work.
- Commit or push only when asked.
