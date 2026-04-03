# Local Development on Ubuntu

## Prerequisites

- Ubuntu host
- Docker Engine installed locally
- Docker CLI installed
- Node.js and npm installed

## Default Ports

- Frontend: `http://127.0.0.1:8080`
- Backend: `http://127.0.0.1:9001`

## Verify Docker Access

Run:

```bash
./server/scripts/check-docker-access.sh
```

Expected:

- Docker CLI is installed
- Docker daemon is reachable
- `/var/run/docker.sock` exists
- Your user can access Docker

If Docker access fails because of permissions:

```bash
sudo usermod -aG docker "$USER"
```

Then log out and back in.

## Start DockLite Against Real Docker

```bash
npm install
npm run dev:full
```

DockLite seeds the admin login from env defaults on first boot. If you do not override them, the default login is `admin` / `admin`. Change both in Settings after signing in.

## Start DockLite Against the Mock Backend

Use this for UI work or smoke tests when you do not want to touch the real Docker daemon.

```bash
npm install
npm run dev:mock
```

## Backend Environment

See:

- [`server/.env.example`](../server/.env.example)

Important variables:

- `DOCKLITE_HOST`
- `DOCKLITE_PORT`
- `DOCKLITE_DOCKER_SOCKET`
- `DOCKLITE_ADAPTER`

## Test Commands

Frontend unit tests:

```bash
npm test
```

Backend tests:

```bash
npm run server:test
```

Backend type-check:

```bash
npm run server:typecheck
```

Frontend build:

```bash
npm run build
```

Browser smoke test:

```bash
npm run test:e2e
```
