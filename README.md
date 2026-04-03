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
npm install
```

Frontend + real local Docker backend:

```bash
npm run dev:full
```

Frontend + mock backend:

```bash
npm run dev:mock
```

Frontend only:

```bash
npm run dev
```

Backend only:

```bash
npm run server:dev
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

## Validation

```bash
npm test
npm run server:test
npm run server:typecheck
npm run build
npm run test:e2e
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
