# Container Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real container details workflow with `Overview`, `Logs`, `Terminal`, `Inspect`, and `Stats` tabs that works against the currently selected local or remote engine target.

**Architecture:** Add a dedicated `/containers/:containerId` route instead of forcing a split-pane retrofit into the current table page. Extend the backend with typed detail endpoints that match the approved spec, keep Docker-specific shaping in the backend, and build the frontend around a focused detail shell plus small tab components that reuse the existing logs and exec widgets where possible.

**Tech Stack:** React, React Router, React Query, TypeScript, Express, Zod, Vitest, Playwright, Dockerode-backed backend adapters

---

### Task 1: Define Container Detail Contracts

**Files:**
- Modify: `src/lib/api/types.ts`
- Modify: `src/lib/mock-data.ts`
- Modify: `server/src/types.ts`
- Test: `src/lib/mock-data.test.ts`

- [ ] **Step 1: Add the shared detail types**

Define:
- `ContainerMountSummary`
- `ContainerPortBinding`
- `ContainerLabelEntry`
- `ContainerInspectView`
- `ContainerStatsSample`
- `ContainerDetails`

Keep `ContainerSummary` unchanged except where detail types need to reference existing fields.

- [ ] **Step 2: Add mock detail fixtures**

Extend `src/lib/mock-data.ts` with at least one stable mock `ContainerDetails` payload keyed by container id so frontend tests and mock mode have deterministic detail data.

- [ ] **Step 3: Add a minimal contract regression test**

Update `src/lib/mock-data.test.ts` to assert:
- detail fixtures exist for the seeded containers
- inspect payloads are object-shaped
- stats samples include CPU and memory values

- [ ] **Step 4: Run the targeted test**

Run: `npm test -- src/lib/mock-data.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/types.ts src/lib/mock-data.ts src/lib/mock-data.test.ts server/src/types.ts
git commit -m "feat: add container details api contracts"
```

### Task 2: Add Backend Container Detail, Inspect, and Stats Endpoints

**Files:**
- Modify: `server/src/types.ts`
- Modify: `server/src/docker/client.ts`
- Modify: `server/src/engine-controller.ts`
- Modify: `server/src/routes/containers.ts`
- Modify: `server/src/app.test.ts`
- Test: `server/src/docker/client.test.ts`

- [ ] **Step 1: Add backend interface methods**

Extend `DockerBackend` with:
- `getContainerDetails(id: string): Promise<ContainerDetails>`
- `getContainerStats(id: string): Promise<ContainerStatsSample[]>`

- [ ] **Step 2: Implement mock-mode detail and stats support**

In the mock backend path inside `server/src/docker/client.ts`, return seeded `ContainerDetails` data and a small in-memory stats series for each container.

- [ ] **Step 3: Implement real Docker detail shaping**

Use `container.inspect()` plus existing list/stat helpers to build `ContainerDetails`:
- overview fields from inspect output
- mounts and labels summaries
- enough inspect metadata for the overview route response
- a point-in-time stats snapshot from `container.stats({ stream: false })`

Keep Docker-specific parsing private to the backend implementation.

- [ ] **Step 4: Add routes**

Add:
- `GET /api/containers/:id`
- `GET /api/containers/:id/inspect`
- `GET /api/containers/:id/stats`

Return `404` through the existing backend error flow when the container does not exist.

- [ ] **Step 5: Add regression tests**

Cover:
- happy-path detail response
- happy-path inspect response
- happy-path stats response
- missing-container error response

- [ ] **Step 6: Run backend verification**

Run:
- `npm run server:test`
- `npm run server:typecheck`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/src/types.ts server/src/docker/client.ts server/src/engine-controller.ts server/src/routes/containers.ts server/src/app.test.ts server/src/docker/client.test.ts
git commit -m "feat: add container detail backend endpoints"
```

### Task 3: Add Frontend Detail Queries and Base Routing

**Files:**
- Modify: `src/lib/api/resources.ts`
- Modify: `src/hooks/use-containers.ts`
- Modify: `src/App.tsx`
- Create: `src/pages/ContainerDetails.tsx`
- Test: `src/pages/ContainerDetails.test.tsx`

- [ ] **Step 1: Add API helpers**

Add:
- `getContainerDetails(id: string)`
- `getContainerInspect(id: string)`
- `getContainerStats(id: string)`

- [ ] **Step 2: Add React Query hooks**

Add:
- `useContainerDetails(containerId)`
- `useContainerInspect(containerId)`
- `useContainerStats(containerId)`

Use stable query keys that include both `selectedEngineId` and `containerId`, for example:
- `["container-details", selectedEngineId, containerId]`
- `["container-inspect", selectedEngineId, containerId]`
- `["container-stats", selectedEngineId, containerId]`

- [ ] **Step 3: Add the route**

Register a dedicated details route:
- `/containers/:containerId`

Keep `/containers` for the list page.

- [ ] **Step 4: Add a failing direct-route test**

Add `src/pages/ContainerDetails.test.tsx` with a route-aware render that verifies `/containers/:containerId` mounts the page and requests detail data for the route param.

- [ ] **Step 5: Run the targeted test to see it fail**

Run: `npm test -- src/pages/ContainerDetails.test.tsx`
Expected: FAIL because the route-aware details page does not exist yet

- [ ] **Step 6: Implement the minimal route wiring**

Create `src/pages/ContainerDetails.tsx` with loading/error placeholders so the failing direct-route test can pass once route wiring exists.

- [ ] **Step 7: Re-run the targeted test**

Run: `npm test -- src/pages/ContainerDetails.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/api/resources.ts src/hooks/use-containers.ts src/App.tsx src/pages/ContainerDetails.tsx src/pages/ContainerDetails.test.tsx
git commit -m "feat: add container details route and queries"
```

### Task 4: Build the Container Details Shell and Overview Tab

**Files:**
- Create: `src/components/container-details/ContainerDetailsHeader.tsx`
- Create: `src/components/container-details/ContainerOverviewTab.tsx`
- Create: `src/components/container-details/ContainerStatsMiniChart.tsx`
- Modify: `src/pages/ContainerDetails.tsx`
- Test: `src/pages/ContainerDetails.test.tsx`
- Test: `src/components/ContainerActionButtons.test.tsx`

- [ ] **Step 1: Write the failing detail-shell test**

Add `src/pages/ContainerDetails.test.tsx` covering:
- loading state
- error state
- header rendering
- `Overview` tab content from mock details

- [ ] **Step 2: Run the new test to verify it fails**

Run: `npm test -- src/pages/ContainerDetails.test.tsx`
Expected: FAIL because the detail shell and tab content do not exist

- [ ] **Step 3: Implement the detail shell**

In `src/pages/ContainerDetails.tsx`:
- load the selected container details
- show a back link to `/containers`
- render a header with status, image, engine endpoint, and quick actions
- render tab chrome for `Overview`, `Logs`, `Terminal`, `Inspect`, `Stats`

- [ ] **Step 4: Implement the overview tab**

Show:
- image
- state/status
- compose metadata
- ports
- mounts
- labels summary
- existing quick actions for the current container

Use focused components rather than adding more logic to the page file.

If the overview tab exposes quick actions in a details-specific layout, extend `src/components/ContainerActionButtons.test.tsx` to cover any new accessible names or affordances.

- [ ] **Step 5: Re-run the targeted test**

Run: `npm test -- src/pages/ContainerDetails.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/ContainerDetails.tsx src/pages/ContainerDetails.test.tsx src/components/container-details/ContainerDetailsHeader.tsx src/components/container-details/ContainerOverviewTab.tsx src/components/container-details/ContainerStatsMiniChart.tsx
git commit -m "feat: add container details shell"
```

### Task 5: Add Logs, Terminal, Inspect, and Stats Tabs

**Files:**
- Modify: `src/pages/ContainerDetails.tsx`
- Create: `src/components/container-details/ContainerInspectTab.tsx`
- Create: `src/components/container-details/ContainerStatsTab.tsx`
- Modify: `src/components/ContainerLogs.tsx`
- Modify: `src/components/ContainerExec.tsx`
- Test: `src/pages/ContainerDetails.test.tsx`
- Test: `src/components/ContainerLogs.test.tsx`

- [ ] **Step 1: Extend the failing detail test coverage**

Add expectations for:
- logs tab renders the existing stream widget
- terminal tab renders the exec widget
- inspect tab renders formatted JSON and copy affordance
- stats tab renders key metrics and sample trend output

- [ ] **Step 2: Run the detail test to verify it fails**

Run: `npm test -- src/pages/ContainerDetails.test.tsx`
Expected: FAIL because the remaining tabs are placeholders

- [ ] **Step 3: Reuse logs and terminal widgets**

Embed the existing `ContainerLogs` and `ContainerExec` components inside the details tabs rather than opening independent overlays from the details page.

- [ ] **Step 4: Add inspect and stats tab components**

Implement:
- searchable or scrollable formatted inspect JSON
- copy raw JSON action
- point-in-time stats cards for CPU, memory, network I/O, and block I/O
- optional trend visualization only when more than one `ContainerStatsSample` is available

- [ ] **Step 5: Re-run the detail test**

Run: `npm test -- src/pages/ContainerDetails.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/ContainerDetails.tsx src/pages/ContainerDetails.test.tsx src/components/container-details/ContainerInspectTab.tsx src/components/container-details/ContainerStatsTab.tsx src/components/ContainerLogs.tsx src/components/ContainerExec.tsx src/components/ContainerLogs.test.tsx
git commit -m "feat: add container detail tabs"
```

### Task 6: Integrate Detail Navigation Into Existing Container Lists

**Files:**
- Modify: `src/pages/Containers.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/components/ContainerActionButtons.tsx`
- Test: `src/pages/Containers.test.tsx`
- Test: `src/pages/Dashboard.test.tsx`
- Test: `src/components/ContainerActionButtons.test.tsx`

- [ ] **Step 1: Add focused failing navigation tests**

Cover:
- containers page opens detail route from a row-level affordance
- dashboard cards or rows can navigate into the same detail route
- existing logs/terminal actions still behave as before

- [ ] **Step 2: Run the targeted tests to verify failure**

Run:
- `npm test -- src/pages/Containers.test.tsx`
- `npm test -- src/pages/Dashboard.test.tsx`

Expected: FAIL until the new affordances exist

- [ ] **Step 3: Add explicit detail entry points**

Avoid relying on row click alone. Add a visible detail affordance such as a linked container name or dedicated `Details` action that coexists with the current quick-action buttons.

- [ ] **Step 4: Re-run targeted tests**

Run:
- `npm test -- src/pages/Containers.test.tsx`
- `npm test -- src/pages/Dashboard.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Containers.tsx src/pages/Dashboard.tsx src/components/ContainerActionButtons.tsx src/pages/Containers.test.tsx src/pages/Dashboard.test.tsx src/components/ContainerActionButtons.test.tsx
git commit -m "feat: add container detail navigation"
```

### Task 7: Add Playwright Coverage and Final Verification

**Files:**
- Create: `tests/e2e/container-details.spec.ts`
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Add a new end-to-end details flow**

Cover:
- navigate from `/containers` to a container details route
- verify tab navigation
- verify inspect tab content
- verify logs or terminal tab mounts without console errors

- [ ] **Step 2: Keep the existing smoke test aligned**

Only update `tests/e2e/smoke.spec.ts` if the new detail affordance changes stable selectors already used there.

- [ ] **Step 3: Run targeted E2E coverage**

Run:
- `npm run test:e2e -- tests/e2e/container-details.spec.ts`
- `npm run test:e2e -- tests/e2e/smoke.spec.ts`

Expected: PASS

- [ ] **Step 4: Run the full verification set**

Run:
- `npm run lint`
- `npm test`
- `npm run server:test`
- `npm run server:typecheck`
- `npm run build`
- `npm run test:e2e`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/container-details.spec.ts tests/e2e/smoke.spec.ts
git commit -m "test: cover container details workflow"
```

### Notes For Execution

- Keep Docker inspect parsing in the backend. Do not spread raw Docker payload traversal across frontend components.
- Reuse the current `ContainerLogs` and `ContainerExec` widgets instead of introducing a second implementation for the same capabilities.
- Prefer small `src/components/container-details/*` files over inflating `src/pages/Containers.tsx` or `src/pages/ContainerDetails.tsx`.
- Preserve current DockLite styling: dense layout, mono metadata, explicit status language, no modal-heavy UX.
