# Remote Engine Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend-managed local, SSH, and TCP/TLS Docker engine targets that can be created, tested, saved, activated, edited, and removed from DockLite Settings, with all secrets kept in the backend.

**Architecture:** Extend the current engine target model from fixed local sockets to persisted target profiles stored by the backend. Keep the frontend limited to selecting and managing sanitized target metadata through new API routes. Route all existing resource operations through the selected target so the rest of the app remains target-agnostic.

**Tech Stack:** TypeScript, Express, Zod, dockerode, React, TanStack Query, Vitest, Testing Library, Playwright

---

### Task 1: Extend Shared Engine Target Types And API Contracts

**Files:**
- Modify: `src/lib/api/types.ts`
- Modify: `src/lib/api/resources.ts`
- Modify: `src/hooks/use-engine.ts`
- Test: `src/pages/DockerSettings.test.tsx`

- [ ] **Step 1: Write the failing frontend contract test expectations**

Add assertions to `src/pages/DockerSettings.test.tsx` for the new target list shape and target-management actions. Cover at least:

- mixed local and remote targets
- health/status metadata rendering inputs
- create/test/select route usage

Example fixture shape:

```ts
{
  id: "prod-ssh",
  label: "Prod Server",
  endpoint: "ssh://ops@prod.example.internal",
  active: false,
  available: true,
  kind: "ssh",
  source: "saved",
  lastHealth: {
    status: "healthy",
    message: "Connected",
    checkedAt: "2026-03-31T12:00:00.000Z",
  },
}
```

- [ ] **Step 2: Run the focused frontend test to verify it fails**

Run: `npm test -- src/pages/DockerSettings.test.tsx`
Expected: FAIL with missing fields, missing hooks, or missing route handling.

- [ ] **Step 3: Add the shared types and request helpers**

Update `src/lib/api/types.ts` with:

- `EngineTargetKind`
- `EngineTargetHealth`
- enriched `EngineTarget`
- `CreateEngineTargetPayload`
- `UpdateEngineTargetPayload`
- `TestEngineTargetPayload`

Add request helpers in `src/lib/api/resources.ts`:

- `createEngineTarget`
- `updateEngineTarget`
- `deleteEngineTarget`
- `testEngineTarget`
- `retestEngineTarget`

Extend `src/hooks/use-engine.ts` with matching mutations and query invalidation.

- [ ] **Step 4: Re-run the focused frontend test**

Run: `npm test -- src/pages/DockerSettings.test.tsx`
Expected: still FAIL, but now only because the Settings UI does not implement the new management surface yet.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/types.ts src/lib/api/resources.ts src/hooks/use-engine.ts src/pages/DockerSettings.test.tsx
git commit -m "refactor: add remote engine target api contracts"
```

### Task 2: Add Backend Target Profile Types, Validation, And Store

**Files:**
- Create: `server/src/engine-targets/types.ts`
- Create: `server/src/engine-targets/schemas.ts`
- Create: `server/src/engine-targets/store.ts`
- Create: `server/src/engine-targets/store.test.ts`
- Modify: `server/src/types.ts`
- Test: `server/src/engine-targets/store.test.ts`

- [ ] **Step 1: Write the failing backend store tests**

Create `server/src/engine-targets/store.test.ts` covering:

- loading empty store with built-in defaults
- persisting saved SSH/TLS targets
- sanitizing API-visible target output
- preserving active target selection
- deleting a saved target removes it from storage

Example expectation:

```ts
expect(targets[0]).toEqual(
  expect.objectContaining({
    id: expect.any(String),
    kind: expect.stringMatching(/local|ssh|tcpTls/),
    label: expect.any(String),
  }),
);
```

- [ ] **Step 2: Run the focused backend test to verify it fails**

Run: `npm run server:test -- server/src/engine-targets/store.test.ts`
Expected: FAIL because the engine-target store modules do not exist yet.

- [ ] **Step 3: Implement the target profile types and JSON-backed store**

Add:

- `server/src/engine-targets/types.ts`
  - persisted profile types
  - public/sanitized target output types
- `server/src/engine-targets/schemas.ts`
  - Zod validation for `local`, `ssh`, `tcpTls`
  - explicit rejection of non-TLS TCP targets
- `server/src/engine-targets/store.ts`
  - JSON file persistence
  - active-target tracking
  - sanitized list output

Update `server/src/types.ts` so server-side code can use the new target metadata types.

- [ ] **Step 4: Re-run the focused backend test**

Run: `npm run server:test -- server/src/engine-targets/store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/engine-targets/types.ts server/src/engine-targets/schemas.ts server/src/engine-targets/store.ts server/src/engine-targets/store.test.ts server/src/types.ts
git commit -m "feat: add engine target profile store"
```

### Task 3: Add Backend Asset Storage For Uploaded TLS Material

**Files:**
- Create: `server/src/engine-targets/assets.ts`
- Create: `server/src/engine-targets/assets.test.ts`
- Modify: `package.json`
- Test: `server/src/engine-targets/assets.test.ts`

- [ ] **Step 1: Write the failing asset storage tests**

Create `server/src/engine-targets/assets.test.ts` covering:

- saving uploaded CA/cert/key material into target-owned directories
- overwriting or replacing old files cleanly
- rejecting missing required uploaded files for `mtls`
- returning file references without file contents

- [ ] **Step 2: Run the focused backend test to verify it fails**

Run: `npm run server:test -- server/src/engine-targets/assets.test.ts`
Expected: FAIL because the asset helper does not exist.

- [ ] **Step 3: Implement backend-local asset handling**

Add `server/src/engine-targets/assets.ts` that:

- writes uploaded TLS assets into `server/data/engine-target-assets/<target-id>/`
- normalizes filenames
- returns internal file reference metadata
- ensures cleanup on target deletion

If multipart handling is needed for route integration, add the minimal upload dependency:

```bash
npm install multer
npm install -D @types/multer
```

Only add it once route work starts if no simpler existing parser fits.

- [ ] **Step 4: Re-run the focused backend test**

Run: `npm run server:test -- server/src/engine-targets/assets.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json server/src/engine-targets/assets.ts server/src/engine-targets/assets.test.ts
git commit -m "feat: add tls asset storage for engine targets"
```

### Task 4: Extend EngineController And Engine Routes For Saved Targets

**Files:**
- Modify: `server/src/engine-controller.ts`
- Modify: `server/src/routes/engine.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/app.test.ts`
- Test: `server/src/app.test.ts`

- [ ] **Step 1: Write the failing route tests**

Extend `server/src/app.test.ts` to cover:

- `POST /api/engine/targets`
- `PATCH /api/engine/targets/:id`
- `DELETE /api/engine/targets/:id`
- `POST /api/engine/targets/test`
- `POST /api/engine/targets/:id/test`
- selecting a saved target by ID

- [ ] **Step 2: Run the focused backend app tests to verify they fail**

Run: `npm run server:test -- server/src/app.test.ts`
Expected: FAIL with `404`, validation errors, or missing methods on the backend.

- [ ] **Step 3: Add target CRUD and testing to the controller and routes**

Update `server/src/engine-controller.ts` to:

- load built-in and saved targets
- keep one active target
- expose methods for create/update/delete/test/list/select

Update `server/src/routes/engine.ts` to:

- parse create/update/test payloads with Zod
- call the new controller methods
- return sanitized target responses

Update `server/src/app.ts` only if additional request parsing is required for the new routes.

- [ ] **Step 4: Re-run the focused backend app tests**

Run: `npm run server:test -- server/src/app.test.ts`
Expected: PASS for route shape and target lifecycle behavior, with connection tests still stubbed or mock-backed as needed.

- [ ] **Step 5: Commit**

```bash
git add server/src/engine-controller.ts server/src/routes/engine.ts server/src/app.ts server/src/app.test.ts
git commit -m "feat: add engine target management routes"
```

### Task 5: Implement TCP/TLS Target Backend Factory And Connection Testing

**Files:**
- Modify: `server/src/docker/client.ts`
- Create: `server/src/engine-targets/connection-test.ts`
- Create: `server/src/engine-targets/connection-test.test.ts`
- Test: `server/src/engine-targets/connection-test.test.ts`
- Test: `server/src/app.test.ts`

- [ ] **Step 1: Write the failing TCP/TLS connection tests**

Create `server/src/engine-targets/connection-test.test.ts` with cases for:

- healthy TLS-backed target
- missing CA/cert/key material
- certificate mismatch
- daemon unreachable
- insecure TCP profile rejection

- [ ] **Step 2: Run the focused backend connection test**

Run: `npm run server:test -- server/src/engine-targets/connection-test.test.ts`
Expected: FAIL because the connection tester and TLS handling do not exist.

- [ ] **Step 3: Implement the direct TCP/TLS backend path**

Add `server/src/engine-targets/connection-test.ts` to:

- build a `dockerode` client from validated TLS profile input
- test `.info()` or equivalent lightweight connectivity
- classify failures into normalized diagnostic codes/messages

Update `server/src/docker/client.ts` so backend creation can use:

- local socket path
- remote TCP/TLS host + cert material

- [ ] **Step 4: Re-run the focused tests**

Run:

- `npm run server:test -- server/src/engine-targets/connection-test.test.ts`
- `npm run server:test -- server/src/app.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/docker/client.ts server/src/engine-targets/connection-test.ts server/src/engine-targets/connection-test.test.ts server/src/app.test.ts
git commit -m "feat: add tcp tls docker engine targets"
```

### Task 6: Implement SSH Target Backend Factory And Connection Testing

**Files:**
- Modify: `server/src/docker/client.ts`
- Modify: `server/src/engine-targets/connection-test.ts`
- Modify: `server/src/engine-targets/connection-test.test.ts`
- Modify: `server/src/app.test.ts`
- Test: `server/src/engine-targets/connection-test.test.ts`

- [ ] **Step 1: Write the failing SSH target tests**

Add cases for:

- valid SSH profile using agent auth
- valid SSH profile using key-file references
- authentication failure
- hostname resolution failure
- unsupported SSH config combinations

- [ ] **Step 2: Run the focused SSH connection tests**

Run: `npm run server:test -- server/src/engine-targets/connection-test.test.ts`
Expected: FAIL for SSH profiles.

- [ ] **Step 3: Implement the SSH backend path**

Update `server/src/docker/client.ts` and `server/src/engine-targets/connection-test.ts` so SSH targets can:

- build a backend from a backend-managed SSH profile
- test connectivity
- return normalized diagnostics

Prefer the least risky first implementation:

- use Docker's existing SSH transport model if that simplifies backend creation
- keep the transport hidden behind `DockerBackend`

- [ ] **Step 4: Re-run the focused SSH and route tests**

Run:

- `npm run server:test -- server/src/engine-targets/connection-test.test.ts`
- `npm run server:test -- server/src/app.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/docker/client.ts server/src/engine-targets/connection-test.ts server/src/engine-targets/connection-test.test.ts server/src/app.test.ts
git commit -m "feat: add ssh docker engine targets"
```

### Task 7: Build The Settings Target Management UI

**Files:**
- Create: `src/components/EngineTargetDialog.tsx`
- Create: `src/components/EngineTargetList.tsx`
- Modify: `src/pages/DockerSettings.tsx`
- Modify: `src/pages/DockerSettings.test.tsx`
- Modify: `src/hooks/use-engine.ts`
- Test: `src/pages/DockerSettings.test.tsx`

- [ ] **Step 1: Write the failing Settings UI tests**

Extend `src/pages/DockerSettings.test.tsx` to cover:

- rendering local and saved remote targets
- opening the add-engine form
- per-target actions: `Test`, `Edit`, `Remove`, `Activate`
- type-specific form fields for `Local`, `SSH`, and `TCP/TLS`
- health state rendering

- [ ] **Step 2: Run the focused Settings test**

Run: `npm test -- src/pages/DockerSettings.test.tsx`
Expected: FAIL because the management UI is still a simple toggle group.

- [ ] **Step 3: Implement the management surface**

Create:

- `src/components/EngineTargetDialog.tsx`
  - add/edit form
  - type-specific sections
  - connection testing before save
- `src/components/EngineTargetList.tsx`
  - list rows/cards with status, endpoint, actions

Update `src/pages/DockerSettings.tsx` to:

- keep `DockLite Backend` intact
- expand `Docker Engines` into a real management area
- wire create/update/delete/test/select mutations
- keep compact, monospace, operational styling

- [ ] **Step 4: Re-run the focused Settings test**

Run: `npm test -- src/pages/DockerSettings.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/EngineTargetDialog.tsx src/components/EngineTargetList.tsx src/pages/DockerSettings.tsx src/pages/DockerSettings.test.tsx src/hooks/use-engine.ts
git commit -m "feat: add engine target management ui"
```

### Task 8: Add E2E Coverage And Final Verification

**Files:**
- Create: `tests/e2e/engine-targets.spec.ts`
- Modify: `playwright.config.ts`
- Test: `tests/e2e/engine-targets.spec.ts`

- [ ] **Step 1: Write the failing Playwright scenario**

Create `tests/e2e/engine-targets.spec.ts` for the mock-safe and form-safe flows:

- view engine targets in Settings
- open add-engine dialog
- validate required fields for SSH and TLS targets
- cancel and remove draft actions
- verify that activating an existing target still works

Do not require a real remote host in CI or default local test runs.

- [ ] **Step 2: Run the focused E2E test to verify it fails**

Run: `npm run test:e2e -- tests/e2e/engine-targets.spec.ts`
Expected: FAIL because the new Settings management UI does not yet satisfy the flow.

- [ ] **Step 3: Finish any missing wiring and stabilize selectors**

Adjust:

- `tests/e2e/engine-targets.spec.ts`
- `playwright.config.ts`
- any missing `aria-label` or stable test-facing UI labels in the Settings components

Keep selectors role- and label-based.

- [ ] **Step 4: Run the full verification set**

Run:

- `npm run lint`
- `npm test`
- `npm run server:test`
- `npm run server:typecheck`
- `npm run build`
- `npm run test:e2e`

Expected: all commands pass.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/engine-targets.spec.ts playwright.config.ts src/components/EngineTargetDialog.tsx src/components/EngineTargetList.tsx src/pages/DockerSettings.tsx src/pages/DockerSettings.test.tsx
git commit -m "test: cover engine target management"
```

## Notes For The Next Plan

After this plan is complete, the next implementation plan should cover container details:

- `GET /api/containers/:id`
- `GET /api/containers/:id/inspect`
- `GET /api/containers/:id/stats`
- details UI tabs: `Overview`, `Logs`, `Terminal`, `Inspect`, `Stats`

That should be written as a separate plan because it builds on the target-agnostic engine foundation delivered here.
