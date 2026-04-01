# Standalone Remote Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add standalone remote-access protection to DockLite with built-in HTTPS support, single-admin password auth, secure server-side sessions, localhost bypass, and a frontend password-management flow that matches the approved remote-auth spec.

**Architecture:** Keep auth fully backend-owned. Add an auth subsystem that persists the admin password hash and session state, classifies local versus remote requests, enforces the same rules across HTTP, SSE, and WebSocket channels, and serves the production frontend from the same origin when remote mode is enabled. Keep the frontend thin: it should render login/session UX, call the auth endpoints with same-origin credentials, and expose a Settings security section for password rotation and TLS status.

**Tech Stack:** TypeScript, Express, Node HTTP/HTTPS, React, React Router, TanStack Query, Zod, Vitest, Testing Library, Supertest, Playwright

---

### Task 1: Add Shared Auth Contracts And Frontend Client Primitives

**Files:**
- Modify: `src/lib/api/types.ts`
- Modify: `src/lib/api/client.ts`
- Modify: `src/lib/api/resources.ts`
- Modify: `src/hooks/use-engine.ts`
- Create: `src/hooks/use-auth.ts`
- Test: `src/pages/DockerSettings.test.tsx`
- Test: `src/App.test.tsx` or create `src/AppAuth.test.tsx`

- [ ] **Step 1: Write the failing frontend contract tests**

Add or extend frontend tests to cover:

- auth session metadata shape
- unauthenticated session handling
- password change mutation wiring
- security config fetch and update wiring
- same-origin auth requests using credentials
- disabling or ignoring user-editable API base overrides when remote auth mode is active
- bootstrap session state that exposes setup-required status without returning password material

Example session fixture:

```ts
{
  authenticated: true,
  authRequired: true,
  localBypass: false,
  csrfToken: "csrf-token",
  session: {
    id: "session-123",
    expiresAt: "2026-04-01T12:00:00.000Z",
    idleExpiresAt: "2026-04-01T10:00:00.000Z",
  },
  security: {
    httpsEnabled: true,
    hasPassword: true,
  },
}
```

- [ ] **Step 2: Run the focused frontend tests to verify they fail**

Run: `npm test -- src/pages/DockerSettings.test.tsx src/App.test.tsx`
Expected: FAIL with missing auth types, helpers, or hooks.

- [ ] **Step 3: Add shared auth types and client helpers**

Update `src/lib/api/types.ts` with auth-facing types:

- `AuthSessionState`
- `AuthLoginPayload`
- `ChangePasswordPayload`
- `SecurityConfigView`
- `UpdateSecurityConfigPayload`

Update `src/lib/api/client.ts` to:

- send `credentials: "include"` for same-origin auth-aware requests
- support CSRF header injection for state-changing requests
- provide a same-origin default for production auth mode without breaking dev overrides
- disable or ignore user-supplied cross-origin API base overrides when the backend reports same-origin auth mode

Update `src/lib/api/resources.ts` with:

- `getAuthSession`
- `login`
- `logout`
- `changePassword`
- `getSecurityConfig`
- `updateSecurityConfig`

Add `src/hooks/use-auth.ts` with session query and auth mutations.

- [ ] **Step 4: Re-run the focused frontend tests**

Run: `npm test -- src/pages/DockerSettings.test.tsx src/App.test.tsx`
Expected: still FAIL, but only because the backend routes and UI are not implemented yet.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/types.ts src/lib/api/client.ts src/lib/api/resources.ts src/hooks/use-auth.ts src/pages/DockerSettings.test.tsx src/App.test.tsx
git commit -m "refactor: add auth api contracts"
```

### Task 2: Implement Backend Auth Storage, Password Hashing, Sessions, And Request Classification

**Files:**
- Create: `server/src/auth/config.ts`
- Create: `server/src/auth/config.test.ts`
- Create: `server/src/auth/password.ts`
- Create: `server/src/auth/password.test.ts`
- Create: `server/src/auth/sessions.ts`
- Create: `server/src/auth/sessions.test.ts`
- Create: `server/src/auth/request-classifier.ts`
- Create: `server/src/auth/request-classifier.test.ts`
- Create: `server/src/auth/csrf.ts`
- Create: `server/src/auth/types.ts`
- Modify: `server/src/types.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing backend auth-core tests**

Create focused tests for:

- config bootstrap and restrictive file permissions
- `argon2id` hashing and verification
- session creation, idle expiry, absolute expiry, and revocation
- request classification for local versus remote requests
- loopback origin validation behavior
- CSRF token generation and verification
- rejection or warning for group/world-writable auth and TLS paths

- [ ] **Step 2: Run the focused backend tests to verify they fail**

Run: `npm run server:test -- server/src/auth/config.test.ts server/src/auth/password.test.ts server/src/auth/sessions.test.ts server/src/auth/request-classifier.test.ts`
Expected: FAIL because auth modules and dependencies do not exist yet.

- [ ] **Step 3: Add the auth core modules**

Implement:

- `server/src/auth/config.ts`
  - JSON-backed auth config store in `server/data`
  - atomic writes
  - `0700` directories / `0600` files
  - bootstrap state helpers
  - reject or warn on group/world-writable auth storage and TLS key paths
- `server/src/auth/password.ts`
  - `argon2id` hashing and verification
  - password policy checks
- `server/src/auth/sessions.ts`
  - server-side session store
  - idle and absolute expiry
  - revoke-all-on-password-change support
- `server/src/auth/request-classifier.ts`
  - loopback detection
  - browser origin checks for HTTP/SSE/WS
  - no forwarded-header trust by default
- `server/src/auth/csrf.ts`
  - per-session CSRF tokens

Add the minimal dependency for password hashing:

```bash
npm install argon2
```

If the auth config store needs a dedicated directory helper, keep it inside `server/src/auth/config.ts` unless reuse becomes obvious.

- [ ] **Step 4: Re-run the focused backend tests**

Run: `npm run server:test -- server/src/auth/config.test.ts server/src/auth/password.test.ts server/src/auth/sessions.test.ts server/src/auth/request-classifier.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json server/src/auth/config.ts server/src/auth/config.test.ts server/src/auth/password.ts server/src/auth/password.test.ts server/src/auth/sessions.ts server/src/auth/sessions.test.ts server/src/auth/request-classifier.ts server/src/auth/request-classifier.test.ts server/src/auth/csrf.ts server/src/auth/types.ts server/src/types.ts
git commit -m "feat: add auth core services"
```

### Task 3: Add Auth Routes, Middleware, And Session Enforcement For HTTP, SSE, And WebSocket

**Files:**
- Create: `server/src/auth/middleware.ts`
- Create: `server/src/routes/auth.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/routes/logs.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/app.test.ts`
- Test: `server/src/app.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Extend `server/src/app.test.ts` to cover:

- remote unauthenticated `GET /api/auth/session`
- remote unauthenticated access blocked on protected API routes
- remote access over plain HTTP is rejected when the request is non-loopback, even if TLS is not configured yet
- local loopback access bypass
- local-only first-run bootstrap route when no password hash exists
- remote login success and failure
- remote auth-not-initialized behavior
- remote HTTPS misconfiguration behavior
- CSRF enforcement on remote mutations
- remote SSE denied without session
- session-protected WebSocket exec upgrade behavior
- password change revoking existing remote sessions
- rate limiting on login and password change
- `GET /api/security/config`
- `POST /api/security/config`
- auth and security responses never include password material or hashes

- [ ] **Step 2: Run the focused backend integration tests to verify they fail**

Run: `npm run server:test -- server/src/app.test.ts`
Expected: FAIL with missing routes, missing middleware, or incorrect auth behavior.

- [ ] **Step 3: Implement auth route and middleware integration**

Add `server/src/routes/auth.ts` with:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `POST /api/auth/change-password`
- `GET /api/security/config`
- `POST /api/security/config`
- local-only bootstrap endpoints required by the spec, for example:
  - `GET /api/auth/bootstrap`
  - `POST /api/auth/bootstrap`
- bootstrap endpoints must reject requests once the admin password hash exists

Add `server/src/auth/middleware.ts` to:

- classify requests as local or remote
- bypass only safe loopback requests
- require valid remote session on protected routes
- enforce CSRF on remote state-changing requests
- set session cookies with `HttpOnly`, `Secure`, and `SameSite=Lax`
- apply basic rate limiting to login and password-change paths

Update `server/src/routes/logs.ts` so SSE routes use the same auth/session checks.

Update `server/src/index.ts` so `/api/containers/:id/exec` WebSocket upgrades:

- run the same request classification
- validate remote sessions
- reject cross-origin loopback attempts
- can be terminated when the backing session is revoked or expires

Update `server/src/app.ts` to wire auth before protected routes and preserve the existing API error shape.

- [ ] **Step 4: Re-run the focused backend integration tests**

Run: `npm run server:test -- server/src/app.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/auth/middleware.ts server/src/routes/auth.ts server/src/app.ts server/src/routes/logs.ts server/src/index.ts server/src/app.test.ts
git commit -m "feat: enforce auth across api and streams"
```

### Task 4: Add Standalone HTTPS Runtime And Same-Origin Production Serving

**Files:**
- Create: `server/src/runtime/config.ts`
- Create: `server/src/runtime/config.test.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/app.ts`
- Modify: `vite.config.ts`
- Modify: `playwright.config.ts`
- Modify: `README.md`
- Modify: `docs/product-vision.md`
- Test: `server/src/runtime/config.test.ts`

- [ ] **Step 1: Write the failing runtime tests**

Add tests for:

- runtime config parsing for local-only versus remote mode
- TLS file validation rules
- host binding behavior when remote mode is enabled
- production static frontend serving path
- remote plain HTTP is rejected for non-loopback access when TLS is absent
- remote HTTP rejection or redirect behavior when HTTPS is configured

- [ ] **Step 2: Run the focused runtime tests to verify they fail**

Run: `npm run server:test -- server/src/runtime/config.test.ts`
Expected: FAIL because runtime config and serving helpers do not exist yet.

- [ ] **Step 3: Implement standalone runtime behavior**

Add `server/src/runtime/config.ts` to centralize:

- remote mode enablement
- bind host/port rules
- HTTPS cert/key paths
- static frontend serving path
- whether local API-base overrides should be ignored in same-origin remote mode

Update `server/src/index.ts` to:

- create HTTP and/or HTTPS servers from runtime config
- bind beyond `127.0.0.1` only when remote mode is intentionally enabled
- log safe, explicit startup status

Update `server/src/app.ts` to serve the built frontend for production same-origin mode and route unknown app paths to the SPA entry point after auth decisions.

Update `vite.config.ts` only if the production build output path or server handoff needs to be explicit.

Refresh `README.md` and `docs/product-vision.md` so the product no longer claims local-only behavior.

- [ ] **Step 4: Re-run the focused runtime tests**

Run: `npm run server:test -- server/src/runtime/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/runtime/config.ts server/src/runtime/config.test.ts server/src/index.ts server/src/app.ts vite.config.ts playwright.config.ts README.md docs/product-vision.md
git commit -m "feat: add standalone remote runtime"
```

### Task 5: Build Frontend Login Flow, Route Gating, And Security Settings

**Files:**
- Modify: `src/App.tsx`
- Create: `src/pages/Login.tsx`
- Create: `src/pages/Login.test.tsx`
- Modify: `src/pages/DockerSettings.tsx`
- Modify: `src/pages/DockerSettings.test.tsx`
- Modify: `src/components/AppLayout.tsx`
- Modify: `src/components/AppSidebar.tsx`
- Modify: `src/test/render.tsx`
- Test: `src/pages/Login.test.tsx`
- Test: `src/pages/DockerSettings.test.tsx`

- [ ] **Step 1: Write the failing frontend behavior tests**

Add tests for:

- showing the login page when auth is required and the user is unauthenticated
- preserving normal app access when local bypass applies
- successful login mutation flow
- logout action visibility and behavior
- password change form validation and submission
- security status rendering in Settings

- [ ] **Step 2: Run the focused frontend tests to verify they fail**

Run: `npm test -- src/pages/Login.test.tsx src/pages/DockerSettings.test.tsx src/App.test.tsx`
Expected: FAIL because the login route, route gating, and security UI do not exist yet.

- [ ] **Step 3: Implement the auth UI**

Create `src/pages/Login.tsx` with:

- password-only form
- explicit remote-auth copy
- wrong-password, expired-session, auth-not-initialized, and HTTPS-misconfiguration states
- local-only setup-required state that routes the operator into bootstrap instead of leaving the app stranded

Update `src/App.tsx` to:

- load auth session state early
- gate protected routes when auth is required
- route unauthenticated remote users to `/login`
- preserve local bypass behavior

Update `src/pages/DockerSettings.tsx` to add:

- security status section
- change-password form
- TLS/auth status display
- remote-auth enabled status
- HTTPS enabled status
- cert/key path status
- session timeout summary
- logout-all-other-sessions action only if the backend exposes it in this slice

Update layout/navigation components only as needed for login/logout ergonomics. Keep the authenticated app shell distinct from the login page.

- [ ] **Step 4: Re-run the focused frontend tests**

Run: `npm test -- src/pages/Login.test.tsx src/pages/DockerSettings.test.tsx src/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/pages/Login.tsx src/pages/Login.test.tsx src/pages/DockerSettings.tsx src/pages/DockerSettings.test.tsx src/components/AppLayout.tsx src/components/AppSidebar.tsx src/test/render.tsx
git commit -m "feat: add frontend auth flows"
```

### Task 6: Add End-To-End Auth Coverage And Final Security Regressions

**Files:**
- Create: `tests/e2e/auth.spec.ts`
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `src/components/ContainerLogs.tsx`
- Modify: `src/components/ContainerExec.tsx`
- Test: `tests/e2e/auth.spec.ts`

- [ ] **Step 1: Write the failing Playwright scenarios**

Add `tests/e2e/auth.spec.ts` to cover:

- unauthenticated user sees login when auth is required
- valid login reaches the dashboard
- invalid login shows an error
- missing-password bootstrap state does not expose remote setup
- local loopback bootstrap flow can initialize the admin password
- HTTPS misconfiguration state is explicit
- password change forces re-authentication
- logout returns to login

If loopback bypass makes direct browser simulation unreliable, configure the Playwright web server for a test mode that forces auth while keeping the production code path intact.

- [ ] **Step 2: Run the focused Playwright tests to verify they fail**

Run: `npm run test:e2e -- tests/e2e/auth.spec.ts`
Expected: FAIL because the auth UI/server behavior is incomplete.

- [ ] **Step 3: Finish browser integration details**

Update any remaining frontend or backend pieces needed for stable auth browser flows, including:

- credentialed same-origin requests
- session-aware SSE handling in `src/components/ContainerLogs.tsx`
- authenticated WebSocket exec connection behavior in `src/components/ContainerExec.tsx`
- Playwright server startup/auth test-mode config in `playwright.config.ts`

- [ ] **Step 4: Re-run the focused Playwright tests**

Run: `npm run test:e2e -- tests/e2e/auth.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/auth.spec.ts tests/e2e/smoke.spec.ts playwright.config.ts src/components/ContainerLogs.tsx src/components/ContainerExec.tsx
git commit -m "test: add auth end-to-end coverage"
```

### Task 7: Run Full Verification And Clean Up Documentation

**Files:**
- Modify: `docs/repo-index.md`
- Modify: any newly touched auth docs if needed

- [ ] **Step 1: Run full project verification**

Run:

```bash
npm run lint
npm test
npm run server:test
npm run server:typecheck
npm run build
npm run test:e2e
```

Expected: all commands exit `0`.

- [ ] **Step 2: Refresh repo docs for the shipped auth feature**

Update `docs/repo-index.md` and any auth-adjacent docs to reflect:

- remote auth support
- same-origin production deployment
- built-in HTTPS expectations
- localhost bypass behavior

- [ ] **Step 3: Re-run any affected targeted tests if docs-driven config changes touched code**

Run the smallest relevant verification command again if runtime defaults or startup docs led to code edits.

- [ ] **Step 4: Commit**

```bash
git add docs/repo-index.md
git commit -m "docs: document standalone remote auth"
```
