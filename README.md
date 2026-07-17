# DockLite Web

DockLite Web is a lightweight browser-based Docker UI intended to cover the common Docker Desktop workflows on the same Ubuntu machine, without shipping a heavyweight desktop shell.

The app now has two parts:

- A React frontend served in the browser
- A lightweight local backend that talks to Docker on Ubuntu

## What Works

- Engine/system information
- Containers list, start, stop, restart, remove, run
- Streaming container logs
- Images list, pull, remove
- Volumes list, create, remove
- Networks list, create, remove
- Backend endpoint configuration from the UI
- Mock backend mode for smoke tests and UI development

## Run

Install dependencies:

```bash
pnpm install
```

Frontend + real local Docker backend:

```bash
pnpm dev:full
```

Frontend + mock backend:

```bash
pnpm dev:mock
```

Frontend only:

```bash
pnpm dev
```

Backend only:

```bash
pnpm server:dev
```

Docker Compose (frontend + backend):

```bash
make compose-up
```

If ports are already in use, override them when starting:

```bash
DOCKLITE_BACKEND_PORT=9002 DOCKLITE_FRONTEND_PORT=8081 make compose-up
```

Stop Docker Compose stack:

```bash
make compose-down
```

## Install as a Desktop App (Linux)

Build a standalone release and install it under `~/.local` with a launcher
icon — the installed app runs independently of this repo:

```bash
pnpm app:install
```

This installs the built frontend plus a bundled server to
`~/.local/share/docklite/app`, a `docklite` command to `~/.local/bin`, and a
DockLite entry in your app grid/dock. Clicking the icon starts the server on
`http://127.0.0.1:9010` (if not already running) and opens it in your browser.
Closing the tab leaves the server running in the background — stop it with
`docklite stop`.

User data (credentials, saved engine targets) lives in
`~/.local/share/docklite/data` and survives upgrades. To upgrade, re-run
`pnpm app:install`: it stops the old version, swaps in the new build, and
restarts it if it was running.

## Validation

```bash
pnpm test
pnpm server:test
pnpm server:typecheck
pnpm build
pnpm test:e2e
```

## Ubuntu Local Docker Notes

- Default Docker socket: `/var/run/docker.sock`
- Default backend URL: `http://127.0.0.1:9001`
- Default frontend URL: `http://127.0.0.1:8080`

On first boot, DockLite seeds the admin login from env defaults. If nothing is configured, it uses `admin` / `admin`. Change both in Settings after signing in.

Before starting the real backend, run:

```bash
./server/scripts/check-docker-access.sh
```

If your user cannot access Docker, add the user to the `docker` group and re-login:

```bash
sudo usermod -aG docker "$USER"
```

## Docs

- [Repo Index](./docs/repo-index.md)
- [Product Vision](./docs/product-vision.md)
- [Local Dev](./docs/local-dev.md)
- [Local Docker MVP Plan](./docs/superpowers/plans/2026-03-30-local-docker-mvp.md)

## Project Skills

- [`.agents/skills/docklite-repo-onboarding/SKILL.md`](./.agents/skills/docklite-repo-onboarding/SKILL.md)
- [`.agents/skills/docklite-local-docker-mvp/SKILL.md`](./.agents/skills/docklite-local-docker-mvp/SKILL.md)
