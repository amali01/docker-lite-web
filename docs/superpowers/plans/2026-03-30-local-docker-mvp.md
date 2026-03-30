# Local Docker MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current mock-data prototype with a local Ubuntu web app that can safely manage the same Docker Engine on the same machine.

**Architecture:** Keep the current React frontend, add a lightweight local backend that talks to Docker through the Unix socket, and migrate the UI page-by-page from mock state to typed API queries and mutations. Use HTTP for CRUD operations and a streaming transport for logs and future events.

**Tech Stack:** Vite, React, TypeScript, Tailwind, Vitest, plus a new local backend service for Docker Engine access

---

### Task 1: Establish the local API surface

**Files:**
- Create: `src/lib/api/types.ts`
- Create: `src/lib/api/client.ts`
- Create: `src/lib/api/resources.ts`
- Modify: `src/lib/mock-data.ts`
- Test: `src/lib/mock-data.test.ts`

- [ ] **Step 1: Define the typed contracts that replace the mock-only mental model**

Create shared types for:

- `EngineInfo`
- `ContainerSummary`
- `ImageSummary`
- `VolumeSummary`
- `NetworkSummary`
- `ContainerLogsChunk`
- mutation payloads for start, stop, restart, remove, and run

- [ ] **Step 2: Keep `mock-data.ts` only as a temporary fixture source**

Refactor the file so it is clearly fixture data, not the future production contract.

- [ ] **Step 3: Add a minimal HTTP client wrapper**

Implement a small API client that can perform:

- `GET /api/engine`
- `GET /api/containers`
- `POST /api/containers/run`
- `POST /api/containers/:id/start`
- `POST /api/containers/:id/stop`
- `POST /api/containers/:id/restart`
- `DELETE /api/containers/:id`
- equivalent endpoints for images, volumes, and networks

- [ ] **Step 4: Add resource-level helpers**

Expose focused functions like `listContainers()`, `startContainer(id)`, and `removeImage(id)` instead of scattering raw fetch calls through page components.

- [ ] **Step 5: Run the existing unit tests**

Run: `npm test`

Expected: current tests pass after the type split and fixture cleanup.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mock-data.ts src/lib/api
git commit -m "refactor: define DockLite API contracts"
```

### Task 2: Add the local Docker bridge backend

**Files:**
- Create: `server/README.md`
- Create: `server/src/index.ts`
- Create: `server/src/docker/client.ts`
- Create: `server/src/routes/engine.ts`
- Create: `server/src/routes/containers.ts`
- Create: `server/src/routes/images.ts`
- Create: `server/src/routes/volumes.ts`
- Create: `server/src/routes/networks.ts`
- Create: `server/src/routes/logs.ts`
- Create: `server/src/types.ts`
- Test: `server/src/**/*.test.ts`

- [ ] **Step 1: Scaffold the backend service**

Choose a minimal HTTP framework and create a local service that binds only to localhost by default.

- [ ] **Step 2: Add Docker access through the local Unix socket**

Read from `/var/run/docker.sock` on Ubuntu and fail early with a clear error when permissions or daemon availability are wrong.

- [ ] **Step 3: Implement engine summary and resource list routes**

Return typed payloads that match the frontend contracts from Task 1.

- [ ] **Step 4: Implement container mutations and run flow**

Support:

- start
- stop
- restart
- remove
- create and run

- [ ] **Step 5: Implement streaming logs**

Expose logs through WebSocket or SSE and define the reconnect behavior.

- [ ] **Step 6: Add backend tests**

Cover adapter logic, route-level errors, and Unix-socket failure modes.

- [ ] **Step 7: Run backend tests**

Run the backend test command introduced during scaffolding.

Expected: route and adapter tests pass without requiring Docker during unit test execution.

- [ ] **Step 8: Commit**

```bash
git add server
git commit -m "feat: add local docker bridge service"
```

### Task 3: Migrate the frontend from fixtures to real data

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/Containers.tsx`
- Modify: `src/pages/Images.tsx`
- Modify: `src/pages/Volumes.tsx`
- Modify: `src/pages/Networks.tsx`
- Modify: `src/pages/DockerSettings.tsx`
- Modify: `src/components/ContainerLogs.tsx`
- Modify: `src/components/RunContainerDialog.tsx`
- Create: `src/hooks/use-engine.ts`
- Create: `src/hooks/use-containers.ts`
- Create: `src/hooks/use-images.ts`
- Create: `src/hooks/use-volumes.ts`
- Create: `src/hooks/use-networks.ts`
- Test: `src/pages/*.test.tsx`
- Test: `src/components/*.test.tsx`

- [ ] **Step 1: Write failing tests for one page migration at a time**

Start with the Containers page because it exercises the most important MVP behaviors.

- [ ] **Step 2: Add query hooks and mutations**

Use TanStack Query for list fetching, invalidation, mutation pending states, and optimistic updates only where they remain truthful.

- [ ] **Step 3: Replace mock state in the Containers page**

Wire filtering, actions, run dialog, and logs to the backend.

- [ ] **Step 4: Migrate Dashboard, Images, Volumes, Networks, and Settings**

Each page should stop importing `mock-data.ts` directly.

- [ ] **Step 5: Add disconnected and permission-error UI states**

Show clear messages when the backend is unreachable or Docker socket access fails.

- [ ] **Step 6: Run frontend tests**

Run: `npm test`

Expected: page tests pass with mocked API responses.

- [ ] **Step 7: Run a production build**

Run: `npm run build`

Expected: frontend bundles cleanly with the new hooks and API layer.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "feat: connect DockLite UI to local docker api"
```

### Task 4: Add local developer workflow and product verification

**Files:**
- Modify: `README.md`
- Create: `docs/local-dev.md`
- Create: `server/.env.example`
- Create: `server/scripts/check-docker-access.sh`
- Create: `tests/e2e/smoke.spec.ts`
- Modify: `playwright.config.ts`

- [ ] **Step 1: Document the Ubuntu-local workflow**

Include:

- Docker prerequisites
- socket permission requirements
- frontend and backend startup
- expected localhost URLs

- [ ] **Step 2: Add a Docker access preflight script**

The script should verify daemon reachability before the user opens the UI.

- [ ] **Step 3: Add an end-to-end smoke test**

Cover:

- engine info visible
- containers list visible
- one safe mutation path against a controlled fixture or test daemon

- [ ] **Step 4: Run the smoke test**

Run the Playwright command introduced during setup.

Expected: the local web app boots and basic same-device flows work.

- [ ] **Step 5: Commit**

```bash
git add README.md docs server/scripts tests/e2e playwright.config.ts
git commit -m "docs: add local workflow and smoke verification"
```
