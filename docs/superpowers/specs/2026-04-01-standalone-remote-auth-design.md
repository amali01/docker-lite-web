# Standalone Remote Auth Design

## Summary

DockLite should gain a first authentication layer aimed at one problem: protecting remote access to a self-hosted DockLite instance. The app remains single-admin for now. Same-machine `localhost` access stays unlocked, while non-local access requires an authenticated admin session.

DockLite should remain standalone. It should serve HTTPS itself using operator-provided certificate and key files, manage its own login flow, issue secure session cookies, and allow the admin password to be changed from the frontend after login.

## Goals

- Protect DockLite when accessed remotely over the web.
- Keep `localhost` access frictionless for same-machine operators.
- Support a single admin login for the whole app.
- Keep credential storage and auth enforcement in the backend only.
- Serve HTTPS directly from DockLite without requiring a reverse proxy.
- Allow password bootstrap from backend config and password update from the frontend.

## Non-Goals

- Multi-user accounts.
- Roles or fine-grained permissions.
- API tokens.
- OAuth or SSO.
- Email-based password reset.
- Built-in public certificate automation for the first release.
- Reverse-proxy-dependent auth as the primary deployment model.

## Product Direction

The user wants DockLite to be installable on a machine and reachable remotely as a web admin console without requiring extra infrastructure. That means auth and TLS cannot be treated as optional deployment extras. They are part of the product.

The correct first version is:

- one admin identity
- password login only
- remote requests gated by auth
- `localhost` bypass preserved
- built-in HTTPS using configured cert/key files

This gives DockLite a secure baseline without overbuilding account management before the product needs it.

## Chosen Approach

### Recommendation

Implement built-in auth plus built-in HTTPS.

Remote users must authenticate through a login page and secure server-side sessions. Local `localhost` requests bypass auth. Passwords are stored only as `argon2id` hashes in a backend-owned config file. HTTPS is terminated by DockLite itself using operator-provided TLS files.

### Why This Approach

- It matches the standalone deployment goal.
- It avoids putting bearer secrets in browsers.
- It keeps the browser untrusted and the backend authoritative.
- It avoids coupling basic security to an external reverse proxy.
- It keeps the first release small enough to reason about.

## Trust Model

### Local vs Remote

DockLite should classify every incoming request as either:

- `local`
- `remote`

`local` means a loopback-origin request observed directly by the backend listener, not merely a request claiming to be local via forwarded headers.

Rules:

- `localhost`, `127.0.0.1`, and `::1` requests may bypass auth.
- non-loopback requests are treated as remote and require auth.
- forwarded headers must not be trusted by default for auth bypass decisions.

This avoids dangerous “proxy says local” mistakes.

## Authentication Flow

### Local Access

- local browser opens DockLite
- no login required
- app works normally

### Remote Access

- remote browser opens DockLite
- unauthenticated user is redirected to `/login`
- admin submits password
- backend verifies password hash
- backend issues session cookie
- authenticated user can access app pages and API routes
- logout destroys the session

### Password Lifecycle

- backend may start with a seeded admin password hash
- if bootstrapped from plaintext env/config, DockLite should hash it immediately into backend-owned storage
- admin may change password from the frontend after login
- password change invalidates all existing remote sessions

## HTTPS Model

DockLite should support built-in HTTPS with operator-provided files:

- certificate path
- private key path

Recommended first-release behavior:

- HTTPS listener enabled when TLS files are configured
- remote authenticated usage is only supported over HTTPS
- plain HTTP may remain available only for loopback/local access
- remote HTTP requests should be rejected or redirected to HTTPS when HTTPS is configured

First release should not attempt automatic public certificate issuance. That introduces DNS, ACME, renewal, and privilege complexity that is outside the first auth slice.

## Backend Architecture

### `AuthConfigStore`

Stores backend-owned auth and TLS configuration, for example in:

- `server/data/auth-config.json`

Suggested stored fields:

- `authEnabled`
- `adminPasswordHash`
- `passwordUpdatedAt`
- `sessionIdleTimeoutMinutes`
- `sessionAbsoluteTimeoutHours`
- `httpsEnabled`
- `tlsCertPath`
- `tlsKeyPath`

Never store plaintext passwords.

### `PasswordService`

Responsibilities:

- hash passwords with `argon2id`
- verify login attempts
- enforce minimum password policy
- rotate password safely

### `SessionService`

Responsibilities:

- issue random server-side session IDs
- persist session state
- enforce idle timeout and absolute expiry
- revoke all sessions on password change

Session storage may begin as a backend-local file or in-memory store persisted by DockLite, as long as the implementation is explicit and testable.

### `RequestClassifier`

Responsibilities:

- determine `local` vs `remote`
- refuse spoofable trust decisions
- expose a clear boolean to auth middleware

### `AuthMiddleware`

Responsibilities:

- bypass auth for local requests
- require valid remote session for protected routes
- allow unauthenticated access only to:
  - `/login`
  - `/logout`
  - minimal bootstrap/status endpoints as needed

### `CsrfService`

For authenticated remote browser sessions:

- issue CSRF token tied to session
- require token on remote state-changing requests

This is required because auth uses cookies.

### `HttpsServerConfig`

Responsibilities:

- validate TLS file presence and readability
- start HTTPS server when configured
- coordinate HTTP behavior for local-only or redirect cases

## Frontend Surface

### Login Page

Minimal fields:

- password

States:

- wrong password
- session expired
- remote auth required
- HTTPS misconfiguration if remote auth cannot be served safely

### Settings: Security

Add a security section that exposes:

- remote auth enabled status
- HTTPS enabled status
- certificate/key path status
- session timeout summary
- change password action
- optional “log out other sessions” action

Settings changes must still go through backend validation and CSRF protection.

## Security Requirements

- Passwords must be hashed with `argon2id`.
- Passwords must never be returned by the API.
- Session cookies must be `HttpOnly`.
- Remote-auth cookies must be `Secure`.
- Session cookies should use `SameSite=Lax` unless a stronger requirement appears.
- CSRF protection is required for remote authenticated mutations.
- Plain HTTP must not be accepted for remote authenticated use.
- Auth bypass must never trust forwarded headers by default.
- Password change must revoke all remote sessions.
- Login and password change paths should support basic rate limiting.

## API Shape

Add backend auth endpoints such as:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `POST /api/auth/change-password`
- `GET /api/security/config`
- `POST /api/security/config`

Response rules:

- never return password material
- return only safe auth/session metadata
- normalize failures into DockLite’s existing API error shape

## UX Rules

- Keep auth messaging explicit, not vague.
- Tell remote users when login is required.
- Tell operators when remote access is blocked because HTTPS is not configured.
- Do not add onboarding sprawl or multi-step account creation UI.
- Preserve DockLite’s dense operational style instead of turning auth into a marketing-style flow.

## Risks

### Local Bypass Mistakes

The largest security risk is misclassifying remote requests as local.

Mitigation:

- classify based on actual socket/connection origin
- do not trust proxy headers by default
- keep bypass logic isolated in one backend unit

### Weak Standalone TLS Setup

Standalone HTTPS can be misconfigured if cert/key files are missing or invalid.

Mitigation:

- validate configuration on startup
- expose clear operator-facing diagnostics
- reject remote auth operation without valid HTTPS

### Session Misconfiguration

Cookies, CSRF, and timeout handling are easy to get subtly wrong.

Mitigation:

- centralize session and CSRF logic
- test login, logout, expiry, and password-change invalidation paths explicitly

## Rollout

Ship in this order:

1. backend auth config, password hashing, session management, request classification
2. built-in HTTPS wiring and remote-access enforcement
3. login page and session-aware frontend bootstrap
4. Settings security section with password change

## Acceptance Criteria

This design is satisfied when:

- remote non-local requests require admin login
- `localhost` access still works without login
- DockLite can serve HTTPS directly with configured cert/key files
- admin password is stored as an `argon2id` hash only
- frontend can change the admin password after login
- remote authenticated state uses secure server-side sessions with CSRF protection
- password changes invalidate existing remote sessions
