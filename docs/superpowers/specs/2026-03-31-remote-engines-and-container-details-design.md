# Remote Engines And Container Details Design

## Summary

DockLite should evolve from a same-machine Docker UI into a local operator console that can also manage Docker engines on other devices. The browser must still talk only to the DockLite backend. The backend becomes responsible for storing engine target profiles, validating remote connectivity, and routing all Docker operations to the currently selected target.

This design also adds a real container details workflow. That work is intentionally target-agnostic so the same details view works whether the active engine is local, SSH-backed, or TCP/TLS-backed.

## Goals

- Support remote Docker engines as first-class selectable targets in Settings.
- Support both SSH-backed and TCP/TLS-backed remote engines.
- Keep secrets and certificate material in the local backend only.
- Preserve DockLite's current mental model: one active engine, one set of resource pages.
- Add a dedicated container details workflow with `Overview`, `Logs`, `Terminal`, `Inspect`, and `Stats`.
- Keep the UX compact, operational, and consistent with DockLite's existing style and branding.

## Non-Goals

- Multi-user authentication or role-based access control.
- Plain TCP remote Docker access without TLS.
- Kubernetes management.
- Docker Hub account integration.
- Full Compose authoring UI.
- A server-side agent installed on remote hosts.
- Copying Docker Desktop or the competitor app's glassy or modal-heavy presentation style.

## Product Direction

The user wants two things at once:

1. Better parity with richer Docker management tools.
2. The ability to use DockLite as a GUI for Docker servers running on other devices.

The correct product shape is not a separate "remote mode." Remote hosts should appear as engine targets inside the existing Settings page. Once selected, the rest of the app should behave exactly as it does for the local engine.

That keeps DockLite aligned with its existing principles:

- browser-first
- local-operator controlled
- fast common workflows
- Docker-native mental model

## Official Docker Guidance That Informs This Design

Docker's documentation supports remote daemon access through SSH and TLS-secured endpoints, and documents Docker contexts as the standard model for switching between engine endpoints.

Relevant references:

- Docker contexts:
  - https://docs.docker.com/engine/manage-resources/contexts/
- Protect the Docker daemon socket / TLS:
  - https://docs.docker.com/engine/security/https/
- Remote access to the Docker daemon:
  - https://docs.docker.com/engine/daemon/remote-access/

This design follows that guidance by:

- supporting `ssh://` and TLS-secured TCP targets
- rejecting insecure plain TCP as a valid target type
- modeling remote endpoints as named engine targets

## Chosen Approach

### Recommendation

Use a hybrid backend transport model:

- local targets use the existing typed backend and Unix socket path flow
- TCP/TLS targets use direct backend-managed Docker connections
- SSH targets use a backend-managed SSH transport path, initially allowed to rely on Docker CLI context or host transport where that reduces implementation risk

### Why This Approach

This is the best incremental fit for the current codebase:

- `EngineController` already represents the "active target" seam.
- The frontend already assumes there is one selected engine at a time.
- The backend is already the correct trust boundary.
- Direct support for TCP/TLS can be added without destabilizing the app.
- SSH is harder than TCP/TLS, so allowing a backend implementation that leans on Docker's existing SSH model reduces risk in the first iteration.

## Current Constraints In The Repo

The current implementation only supports fixed local targets:

- [server/src/engine-controller.ts](../../../server/src/engine-controller.ts)
- [src/pages/DockerSettings.tsx](../../../src/pages/DockerSettings.tsx)
- [src/lib/api/resources.ts](../../../src/lib/api/resources.ts)

The current engine target model is too limited because it only knows:

- `id`
- `label`
- `socketPath`
- adapter kind

That must expand into persisted target profiles that can represent remote endpoints and their connection strategy.

## High-Level Architecture

### Core Principle

The browser never talks directly to a Docker engine, local or remote.

Instead:

1. The browser talks to the DockLite backend.
2. The DockLite backend stores and validates engine target profiles.
3. The DockLite backend routes resource operations to the selected engine target.

### New Backend Units

#### `EngineTargetProfile`

Represents one selectable Docker engine.

Fields:

- `id`
- `label`
- `kind`: `local | ssh | tcpTls`
- `enabled`
- `active`
- `connection`
- `tls`
- `ssh`
- `lastHealth`
- `createdAt`
- `updatedAt`

#### `TargetStore`

Responsible for persisting and loading engine target profiles from backend-local storage.

Responsibilities:

- read/write target metadata
- assign IDs
- maintain a stable active target selection
- keep private material out of API responses
- clean up target-owned uploaded cert assets on deletion

#### `TargetValidator`

Responsible for schema validation and safety checks before save or activate.

Responsibilities:

- validate required fields by target kind
- reject insecure unsupported combinations
- validate path-based file references
- validate uploaded material presence and file ownership rules

#### `ConnectionTester`

Responsible for testing a profile before save or activation.

Responsibilities:

- attempt connection to the target
- return normalized health status
- classify failure modes into user-facing diagnostics

#### `BackendFactory`

Responsible for turning a stored profile into a `DockerBackend`.

Responsibilities:

- create local socket backend
- create TCP/TLS backend
- create SSH-backed backend

#### `ContainerDetailsService`

Responsible for fetching richer per-container data than the list page currently exposes.

Responsibilities:

- summary detail
- inspect payload
- point-in-time stats
- optional future file browser integration

## Data Model

### Stored Target Metadata

Target metadata should be stored in a backend JSON file, for example:

- `server/data/engine-targets.json`

Uploaded TLS material should be stored outside the metadata JSON under a backend-owned directory, for example:

- `server/data/engine-target-assets/<target-id>/`

Suggested stored profile shape:

```json
{
  "id": "prod-ssh-1",
  "label": "Prod Server",
  "kind": "ssh",
  "enabled": true,
  "connection": {
    "host": "prod.example.internal",
    "port": 22
  },
  "ssh": {
    "username": "dockerops",
    "authMode": "agent",
    "keyPath": null,
    "knownHostsPath": null,
    "dockerHostOverride": null
  },
  "lastHealth": {
    "status": "healthy",
    "checkedAt": "2026-03-31T12:00:00.000Z",
    "message": "Connected"
  },
  "createdAt": "2026-03-31T11:45:00.000Z",
  "updatedAt": "2026-03-31T12:00:00.000Z"
}
```

### Target Kinds

#### `local`

Fields:

- `socketPath`

Examples:

- `/var/run/docker.sock`
- `~/.docker/desktop/docker.sock`

#### `ssh`

Fields:

- `host`
- `port`
- `username`
- `authMode`: `agent | keyFile`
- optional `keyPath`
- optional `knownHostsPath`
- optional `dockerHostOverride`

Notes:

- agent-backed auth is the preferred default
- path-based key use is backend-local only
- no secret is returned to the frontend after save

#### `tcpTls`

Fields:

- `host`
- `port`
- optional `serverName`
- `tlsMode`: `serverOnly | mtls`
- cert material references

Cert sources:

- uploaded backend-stored files
- backend-local file paths entered in advanced mode

## API Design

### Engine Target Management

Existing routes:

- `GET /api/engine`
- `GET /api/engine/targets`
- `POST /api/engine/select`

Add:

- `POST /api/engine/targets`
  - create a saved target
- `PATCH /api/engine/targets/:id`
  - edit a saved target
- `DELETE /api/engine/targets/:id`
  - remove a saved target
- `POST /api/engine/targets/test`
  - test an unsaved or existing profile
- `POST /api/engine/targets/:id/test`
  - convenience route for re-test of a saved profile

### API Response Rules

- list routes return sanitized metadata only
- no private key contents are ever returned
- file system paths may be returned only where necessary for advanced path-based editing, and only if that is intentionally part of the admin UX
- errors are normalized into DockLite's existing API error shape

### Container Details API

Add:

- `GET /api/containers/:id`
  - richer container detail than the list row
- `GET /api/containers/:id/inspect`
  - formatted inspect payload for UI display
- `GET /api/containers/:id/stats`
  - point-in-time detail stats

Potential later additions:

- `GET /api/containers/:id/files`
- `GET /api/events`
- `GET /api/system/ports`

## Security Requirements

Remote Docker support is a high-risk feature because all successful targets are privileged operator access.

### Required Rules

- Do not store secrets in the browser.
- Do not store secrets in `localStorage`.
- Do not include private key or client key contents in API responses.
- Reject plain `tcp://host:2375` style targets without TLS.
- Validate all target payloads with explicit schemas.
- Store uploaded files in backend-controlled directories with restrictive permissions.
- Treat path-based credential references as advanced admin-only local backend paths.
- Do not expose arbitrary file-read behavior through the API.

### Transport Rules

- SSH targets are allowed.
- TCP targets are allowed only when TLS is configured.
- Non-TLS TCP targets are rejected at validation time.

### Error Handling Rules

Connection tests should classify errors into actionable categories:

- invalid host or DNS failure
- connection refused
- TLS handshake failure
- certificate mismatch
- missing cert material
- SSH authentication failure
- Docker daemon unreachable
- Docker API negotiation failure

These should be surfaced as user-facing diagnostics without leaking secrets.

## Frontend UX

### Settings Page

Keep the current unified Settings page shape and expand it rather than introducing a new top-level "Servers" area.

Sections:

- `DockLite Backend`
- `Docker Engines`
- `About DockLite`

### Docker Engines Section

The engines section should become a real management surface.

It should include:

- active engine selector
- saved target list
- health indicators
- add/edit/test/remove actions

Each target row should show:

- label
- type badge: `Local`, `SSH`, `TLS`
- endpoint summary
- last health status
- buttons: `Activate`, `Test`, `Edit`, `Remove`

### Add/Edit Flow

Use a compact, dense form dialog or drawer, not a wizard-heavy consumer flow.

Recommended flow:

1. choose type
2. enter fields
3. test connection
4. save

#### Local Form

- label
- socket path

#### SSH Form

- label
- host
- port
- username
- auth mode
- optional key path
- optional known hosts path
- optional Docker host override

#### TCP/TLS Form

- label
- host
- port
- optional server name override
- TLS mode
- upload cert/key/CA
- advanced mode for backend file paths

### UX Tone

DockLite should keep its existing style:

- compact
- operational
- terminal-influenced
- explicit

Avoid:

- glassmorphism
- oversized empty cards
- modal sprawl
- magical or vague status messages

## Container Details UX

### Why This Is Needed

DockLite currently provides list-driven actions, but not a real inspect/details workflow. That is one of the largest product gaps and blocks meaningful parity with both the audited competitor app and Docker Desktop.

### Target Shape

Add a dedicated details workflow that works against the active engine target.

Tabs:

- `Overview`
- `Logs`
- `Terminal`
- `Inspect`
- `Stats`

Later:

- `Files`

### Presentation

Keep it consistent with DockLite's current shell:

- table/list on the left or in the main resource view
- details panel or dedicated route for the selected container
- no heavy modal dependence

### Content By Tab

#### `Overview`

- image
- status
- compose metadata
- ports
- mounts
- labels summary
- quick actions

#### `Logs`

- existing streaming logs UI
- improve with search, timestamps, and copy support in later work

#### `Terminal`

- existing exec flow
- target-agnostic transport through backend

#### `Inspect`

- formatted inspect payload
- searchable text view
- copy raw JSON

#### `Stats`

- CPU
- memory
- network I/O
- block I/O
- recent sample trend where available

## Implementation Phases

### Phase 1: Backend Remote Target Foundation

Deliver:

- persisted target profiles
- target CRUD routes
- target testing
- target activation
- support for local, SSH, and TCP/TLS targets

No major frontend redesign yet.

Success condition:

- user can save a remote engine target and activate it
- existing resource pages operate against that target

### Phase 2: Settings UX

Deliver:

- target management UI
- add/edit/test/remove flows
- health state display
- stronger diagnostics

Success condition:

- a user can fully manage engine targets from Settings without editing backend files by hand

### Phase 3: Container Details

Deliver:

- backend detail endpoints
- frontend details workflow
- tabs for `Overview`, `Logs`, `Terminal`, `Inspect`, `Stats`

Success condition:

- a user can inspect and operate on a container beyond the list row

### Phase 4: Parity Follow-Ups

Candidates:

- `Files` tab
- system ports view
- events stream
- image details/history
- volume details and cloning/import/export
- update/recreate progress UI

## Testing Strategy

### Backend

- unit tests for target schema validation
- unit tests for profile storage and sanitization
- unit tests for backend factory selection
- unit tests for connection error classification
- integration tests for local and mock profiles
- controlled failure-path tests for SSH and TLS validation

### Frontend

- Settings form validation tests
- target list rendering tests
- active target state tests
- details view loading, error, and tab navigation tests

### End-To-End

Playwright should cover:

- create remote target form validation
- activate target
- failed connection diagnostics
- container detail navigation
- inspect tab rendering

Real remote-host verification should remain optional/manual at first because CI and most local environments will not have access to a stable remote Docker host.

## Rollout Recommendation

Ship in this order:

1. remote engine target foundation
2. Settings target management UX
3. container details

That sequence delivers the "GUI for the server" requirement first while keeping the details work reusable across all target kinds.

## Risks

### SSH Complexity

SSH transport and long-lived streaming behavior are more complex than local or TLS-backed direct connections.

Mitigation:

- keep the backend factory abstraction clean
- allow SSH to use Docker's existing transport model initially
- keep logs/exec transport encapsulated behind `DockerBackend`

### Secret Handling Mistakes

Uploading or referencing cert material introduces a risk of accidental leakage.

Mitigation:

- sanitize all API responses
- isolate backend-owned storage
- add explicit tests for secret redaction

### UX Overload In Settings

Target management can easily become bloated.

Mitigation:

- keep dense forms
- make advanced path-based options collapsible
- default to safe common cases

## Open Follow-Up Decisions For Implementation

These are implementation choices, not blockers for the design:

- whether SSH transport uses Docker CLI context invocation first or a direct SSH tunnel abstraction
- whether container details use a split pane or dedicated nested route by default
- whether target health is actively polled or only refreshed on explicit test/select actions

## Acceptance Criteria

This design is satisfied when:

- DockLite can save and activate local, SSH, and TCP/TLS engine targets
- remote targets are managed entirely from Settings
- secrets remain backend-only
- insecure plain TCP remote Docker endpoints are rejected
- the current app pages operate against the selected local or remote engine
- DockLite includes a real container details workflow with `Overview`, `Logs`, `Terminal`, `Inspect`, and `Stats`
