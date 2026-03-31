# DockLite Web Repo Index

## What This App Is

DockLite Web is a local-first Docker UI for Ubuntu with two runtime parts:

- A React frontend served in the browser
- A lightweight local backend that talks to Docker over a Unix socket

It is no longer a mock-only prototype. The app can run against:

- A real local Docker Engine
- A mock backend for smoke tests and UI development

## Product Direction

The intended product remains:

- Faster and lighter than Docker Desktop
- Browser-based
- Same-device and local-first
- Compatible with the Docker CLI mental model

Important constraint:

- A browser cannot open `unix:///var/run/docker.sock` directly
- DockLite therefore needs the local backend bridge that exposes constrained HTTP/WebSocket APIs to the frontend

## Tech Stack

- Vite 5
- React 18
- TypeScript
- Tailwind CSS
- `shadcn/ui` and Radix UI
- React Router
- TanStack Query for resource queries and mutations
- Express 5 + `ws` for the local backend
- `dockerode` for Docker Engine access
- Vitest + Testing Library
- Playwright for smoke coverage

## File Map

### Frontend Shell

- [`src/main.tsx`](../src/main.tsx): React bootstrap and font imports
- [`src/App.tsx`](../src/App.tsx): providers, router, and top-level routes
- [`src/components/AppLayout.tsx`](../src/components/AppLayout.tsx): shell layout with sidebar and routed content
- [`src/components/AppSidebar.tsx`](../src/components/AppSidebar.tsx): navigation and engine status indicator

### Frontend Pages

- [`src/pages/Dashboard.tsx`](../src/pages/Dashboard.tsx): engine summary, resource stats, and container actions
- [`src/pages/Containers.tsx`](../src/pages/Containers.tsx): filterable list, compose grouping, run/start/stop/restart/remove, logs, and terminal
- [`src/pages/Images.tsx`](../src/pages/Images.tsx): image list, pull, remove, copy image IDs
- [`src/pages/Volumes.tsx`](../src/pages/Volumes.tsx): volume list, create, remove
- [`src/pages/Networks.tsx`](../src/pages/Networks.tsx): network list, create, remove
- [`src/pages/DockerSettings.tsx`](../src/pages/DockerSettings.tsx): backend URL, engine target switching, connection test

### Frontend Data Layer

- [`src/lib/api/types.ts`](../src/lib/api/types.ts): shared frontend/backend API contracts
- [`src/lib/api/client.ts`](../src/lib/api/client.ts): HTTP client and base URL persistence
- [`src/lib/api/resources.ts`](../src/lib/api/resources.ts): resource-level request helpers
- [`src/hooks/use-engine.ts`](../src/hooks/use-engine.ts): engine queries and mutations
- [`src/hooks/use-containers.ts`](../src/hooks/use-containers.ts): container and compose actions
- [`src/hooks/use-images.ts`](../src/hooks/use-images.ts): image queries and mutations
- [`src/hooks/use-volumes.ts`](../src/hooks/use-volumes.ts): volume queries and mutations
- [`src/hooks/use-networks.ts`](../src/hooks/use-networks.ts): network queries and mutations
- [`src/lib/mock-data.ts`](../src/lib/mock-data.ts): fixture data used by the mock adapter

### Backend

- [`server/src/index.ts`](../server/src/index.ts): HTTP server bootstrap and terminal WebSocket upgrade handling
- [`server/src/app.ts`](../server/src/app.ts): Express app, routing, CORS, error handling
- [`server/src/engine-controller.ts`](../server/src/engine-controller.ts): selected-engine management and backend delegation
- [`server/src/docker/client.ts`](../server/src/docker/client.ts): real Docker adapter and mock adapter
- [`server/src/routes/engine.ts`](../server/src/routes/engine.ts): engine info and target selection routes
- [`server/src/routes/containers.ts`](../server/src/routes/containers.ts): container and compose routes
- [`server/src/routes/logs.ts`](../server/src/routes/logs.ts): SSE log streaming
- [`server/src/routes/images.ts`](../server/src/routes/images.ts): image routes
- [`server/src/routes/volumes.ts`](../server/src/routes/volumes.ts): volume routes
- [`server/src/routes/networks.ts`](../server/src/routes/networks.ts): network routes

## Current Runtime Behavior

### Engine

- The frontend polls engine info every 30 seconds
- Settings can list and switch between discovered engine targets
- Backend target discovery currently covers the system Docker socket and Docker Desktop for Linux if present

### Containers

- Lists containers from the backend
- Supports run, start, stop, restart, remove, and compose-group start/stop/remove
- Streams logs over SSE
- Opens an interactive shell over WebSocket when the container is running
- Shows CPU, memory, and network stats when the real adapter can collect them

### Images, Volumes, Networks

- Images: list, pull, remove
- Volumes: list, create, remove
- Networks: list, create, remove
- Mock mode supports the same surface area with in-memory fixture state

### Settings

- Persists the backend base URL in local storage
- Can test backend connectivity
- Exposes the selected Docker endpoint and API version

## Current Gaps

### Product Gaps

- No container inspect page
- No build progress UI
- No events stream
- No Compose project inspect/details view
- No confirmation dialogs for destructive actions

### UX Gaps

- Some actions still use legacy wording and lightweight optimistic toasts
- Disconnected and permission states exist, but the diagnostics are still basic
- Terminal behavior is functional but not yet deeply productized

### Engineering Gaps

- The repo still carries historical doc drift in a few places
- Frontend tests pass with noisy `xterm`/canvas warnings under jsdom
- The production frontend bundle is large enough to trigger Vite chunk warnings

## Testing Status

Current automated coverage includes:

- Frontend unit tests for Dashboard, Containers, Settings, logs, status badge, sidebar, and fixtures
- Backend route and adapter tests in mock mode
- One Playwright smoke test that boots the frontend plus mock backend and exercises a safe mutation path

Important caveat:

- The smoke test validates the mock-backed workflow, not a real Docker daemon on the machine

## Suggested Near-Term Work

1. Add inspect/details flows for containers and compose projects.
2. Improve destructive-action confirmations and mutation disabled states.
3. Clean up test noise around `xterm` in jsdom.
4. Reduce the large frontend bundle with route or feature-level code splitting.
5. Expand Playwright coverage beyond the current single smoke path.
