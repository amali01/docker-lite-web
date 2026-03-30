---
name: docklite-local-docker-mvp
description: Use when implementing the real same-device Ubuntu MVP so work stays aligned with browser constraints, Docker Engine access, and CLI-compatible workflows.
---

# DockLite Local Docker MVP

Use this skill for any work that moves the project from a mock frontend into a real local Docker management app.

## Product Frame

Target environment:

- Ubuntu
- Same device only
- Local Docker Engine already installed
- Browser UI served locally

Success means:

- The web UI handles common Docker workflows
- The Docker CLI still remains first-class
- The app is materially lighter than Docker Desktop

## Non-Negotiable Constraint

Do not design solutions that require the browser to connect directly to `/var/run/docker.sock`.

The frontend must talk to a local bridge service. That service can then talk to Docker over:

- Unix socket
- Docker CLI subprocesses where appropriate

## Preferred Architecture

1. React frontend
2. Local backend bound to localhost
3. Docker adapter layer inside the backend
4. Typed resource endpoints for the frontend
5. Streaming transport for logs and future events

## MVP Priority Order

1. Engine connection and health
2. Containers list and lifecycle controls
3. Container run flow
4. Logs streaming
5. Images
6. Volumes
7. Networks

Avoid spending early time on:

- Kubernetes
- remote hosts
- auth systems
- registry UX
- Compose authoring

## Backend Expectations

The backend should:

- start fast
- bind to localhost
- fail clearly when Docker is not installed or permissions are wrong
- map Docker errors into user-readable API errors
- keep Docker-specific complexity out of React components

## Frontend Expectations

The frontend should:

- migrate from mock data to query hooks and mutations
- surface disconnected state honestly
- support loading and pending states for mutations
- avoid pretending a mutation succeeded when Docker rejected it
- keep dense operational tables and fast actions

## Suggested First Reads

1. `docs/repo-index.md`
2. `docs/product-vision.md`
3. `docs/superpowers/plans/2026-03-30-local-docker-mvp.md`

## Delivery Standard

When implementing features under this skill:

- preserve type contracts
- add or update tests
- verify with `npm test` and `npm run build`
- document any required Ubuntu or Docker setup changes
